// Weekly APPEND loader — adds a weekly data folder's rows onto the existing tables.
// Does NOT drop/wipe anything. Idempotent: records loaded folders in `loaded_weeks`
// and skips any already loaded (so re-running can't double-load). This is also the
// load step the auto-updater will reuse.
//
//   node scripts/load-weekly.mjs "UCC 06.01.26" "BE 06.02" ...
//   (folder names are resolved relative to the repo root; absolute paths also work)
import postgres from "postgres";
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, dirname, isAbsolute, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set LOAD_DATABASE_URL or DATABASE_URL"); process.exit(1); }

// ---- parsing helpers (must match load-master.mjs exactly) ----
const splitUcc = (l) => l.split("|").map((f) => { f = f.trim(); return f.startsWith('"') && f.endsWith('"') ? f.slice(1, -1) : f; });
const splitBe = (l) => l.split("*|*").map((f) => f.trim());
function san(v) { if (v === "" || v === undefined) return ""; const m = /^(\d{4})-\d{2}-\d{2}/.exec(v); if (m) { const y = +m[1]; if (y < 1900 || y > 2200) return ""; } return v; }
function csvField(v) { if (v === "") return ""; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
const DATE_COLS = new Set(["filing_date", "processed_date", "lapse_date", "initial_filing_date", "last_si_file_date"]);
const INT_COLS = new Set(["page_count"]);
function sanDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return "";
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (d > dim) return "";
  return v;
}
function sanInt(v) { return /^-?\d+$/.test(v) ? v : ""; }
function sanCol(v, col) { return DATE_COLS.has(col) ? sanDate(v) : INT_COLS.has(col) ? sanInt(v) : san(v); }

const debtorMap = [["UCC1_NUM","ucc1_num"],["UCC3_NUM","ucc3_num"],["DEBTOR_TYPE","debtor_type"],["ORG_NAME","org_name"],["LAST_NAME","last_name"],["FIRST_NAME","first_name"],["MIDDLE_NAME","middle_name"],["SUFFIX","suffix"],["ADDR1","addr1"],["ADDR2","addr2"],["ADDR3","addr3"],["CITY","city"],["STATE","state"],["POSTAL_CODE","postal_code"],["COUNTRY","country"]];
const UCC_PLANS = [
  { file: "FilingAmendments.csv", table: "ucc_amendments", split: splitUcc, map: [["UCC1_NUM","ucc1_num"],["UCC3_NUM","ucc3_num"],["ACTION_TYPE","action_type"]] },
  { file: "SecuredParties.csv", table: "ucc_secured_parties", split: splitUcc, map: debtorMap.map(([k,c]) => k === "DEBTOR_TYPE" ? ["SECURED_PARTY_TYPE","party_type"] : [k,c]) },
  { file: "Debtors.csv", table: "ucc_debtors", split: splitUcc, map: debtorMap },
  { file: "Filings.csv", table: "ucc_filings", split: splitUcc, map: [["UCC1_NUM","ucc1_num"],["UCC3_NUM","ucc3_num"],["FILING_DATE","filing_date"],["PROCESSED_DATE","processed_date"],["ACTION_TYPE","action_type"],["ALT_DESIGNATION_TYPE_ID","alt_designation"],["FILING_TYPE_ID","filing_type_id"],["LAPSE_DATE","lapse_date"],["PAGE_COUNT","page_count"]] },
];
const BE_PLANS = [
  { file: "Agents.csv", table: "be_agents", split: splitBe, map: [["ENTITY_NAME","entity_name"],["ENTITY_NUM","entity_num"],["ORG_NAME","org_name"],["FIRST_NAME","first_name"],["MIDDLE_NAME","middle_name"],["LAST_NAME","last_name"],["PHYSICAL_ADDRESS1","addr1"],["PHYSICAL_CITY","city"],["PHYSICAL_STATE","state"],["PHYSICAL_POSTAL_CODE","postal_code"],["AGENT_TYPE","agent_type"]] },
  { file: "Principals.csv", table: "be_principals", split: splitBe, map: [["ENTITY_NAME","entity_name"],["ENTITY_NUM","entity_num"],["ORG_NAME","org_name"],["FIRST_NAME","first_name"],["MIDDLE_NAME","middle_name"],["LAST_NAME","last_name"],["POSITION_TYPE","position_type"],["ADDRESS1","addr1"],["CITY","city"],["STATE","state"],["POSTAL_CODE","postal_code"]] },
  { file: "Filings.csv", table: "be_entities", split: splitBe, map: [["ENTITY_NAME","entity_name"],["ENTITY_NUM","entity_num"],["INITIAL_FILING_DATE","initial_filing_date"],["JURISDICTION","jurisdiction"],["ENTITY_STATUS","entity_status"],["STANDING_SOS","standing_sos"],["ENTITY_TYPE","entity_type"],["FILING_TYPE","filing_type"],["LLC_MANAGEMENT_STRUCTURE","llc_management_structure"],["LAST_SI_FILE_DATE","last_si_file_date"],["PRINCIPAL_ADDRESS","principal_addr1"],["PRINCIPAL_ADDRESS2","principal_addr2"],["PRINCIPAL_CITY","principal_city"],["PRINCIPAL_STATE","principal_state"],["PRINCIPAL_POSTAL_CODE","principal_postal"]] },
];

const BATCH = +(process.env.BATCH || 25000);
let SQL;
async function connect() { SQL = postgres(URL, { prepare: false, ssl: "require", max: 1, idle_timeout: 0, connect_timeout: 30 }); await SQL`SET statement_timeout = 0`; }

async function appendFile(dir, plan) {
  const path = join(dir, plan.file);
  if (!existsSync(path)) { console.error(`  (skip ${plan.file} — not in folder)`); return 0; }
  const colNames = plan.map.map(([, c]) => c);
  const cols = colNames.join(",");
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let idx = null, batch = [], loaded = 0;
  const flush = async () => {
    if (!batch.length) return;
    const w = await SQL.unsafe(`COPY ${plan.table} (${cols}) FROM STDIN WITH (FORMAT csv, NULL '')`).writable();
    await pipeline(Readable.from([batch.join("")]), w);
    batch = [];
  };
  for await (const line of rl) {
    if (!line) continue;
    if (!idx) { const h = plan.split(line); idx = plan.map.map(([k]) => h.indexOf(k)); continue; }
    const vals = plan.split(line);
    batch.push(idx.map((i, j) => csvField(sanCol(i >= 0 ? (vals[i] ?? "") : "", colNames[j]))).join(",") + "\n");
    loaded++;
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  console.error(`  ${plan.table.padEnd(20)} +${loaded.toLocaleString()} rows`);
  return loaded;
}

async function main() {
  const folders = process.argv.slice(2);
  if (!folders.length) { console.error("Usage: node load-weekly.mjs \"<folder>\" ..."); process.exit(1); }
  await connect();
  await SQL`CREATE TABLE IF NOT EXISTS loaded_weeks (source text PRIMARY KEY, loaded_at timestamptz DEFAULT now(), rows bigint)`;

  for (const f of folders) {
    const dir = isAbsolute(f) ? f : join(ROOT, f);
    const key = basename(f);
    if (!existsSync(dir)) { console.error(`MISSING folder: ${dir}`); continue; }
    const already = await SQL`SELECT 1 FROM loaded_weeks WHERE source = ${key}`;
    if (already.length) { console.error(`SKIP "${key}" — already loaded (idempotent guard)`); continue; }
    const isUcc = existsSync(join(dir, "Debtors.csv"));
    const isBe = existsSync(join(dir, "Agents.csv"));
    const plans = isUcc ? UCC_PLANS : isBe ? BE_PLANS : null;
    if (!plans) { console.error(`SKIP "${key}" — not a recognizable UCC or BE folder`); continue; }
    console.error(`\nAPPEND "${key}"  (${isUcc ? "UCC" : "BE"})`);
    let total = 0;
    for (const plan of plans) total += await appendFile(dir, plan);
    await SQL`INSERT INTO loaded_weeks (source, rows) VALUES (${key}, ${total})`;
    console.error(`  recorded "${key}" in loaded_weeks (${total.toLocaleString()} rows)`);
  }
  console.error("\nDONE ✅");
  await SQL.end();
}
main().catch(async (e) => { console.error("FATAL:", e.message); try { await SQL.end(); } catch {} process.exit(1); });
