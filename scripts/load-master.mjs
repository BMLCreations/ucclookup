// Streaming bulk loader for the FULL California master-unload files (~11 GB).
// Reads each CSV line-by-line (low memory) and loads via Postgres COPY (fast),
// then builds indexes. Run AFTER upgrading Supabase to Pro.
//
//   npm run load:master            # real load (needs LOAD_DATABASE_URL or DATABASE_URL)
//   DRY_RUN=1 npm run load:master  # parse-only, no DB — validates the big files
//
// Tip: set LOAD_DATABASE_URL to Supabase's *Session pooler* URI (port 5432) for
// a stable session; COPY + SET statement_timeout work better there than on the
// transaction pooler.
import postgres from "postgres";
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, "..");
const ROOT = join(WEB, "..");
const UCC = join(ROOT, "UCC Master Upload California");
const BE = join(ROOT, "BE Master Upload California");

const TABLES = ["ucc_filings", "ucc_debtors", "ucc_secured_parties", "ucc_amendments",
  "be_entities", "be_principals", "be_agents"];

const splitUcc = (l) => l.split("|").map((f) => { f = f.trim(); return f.startsWith('"') && f.endsWith('"') ? f.slice(1, -1) : f; });
const splitBe = (l) => l.split("*|*").map((f) => f.trim());

// Null out empties and sentinel/out-of-range dates (e.g. 9999-12-31).
function san(v) {
  if (v === "" || v === undefined) return "";
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(v);
  if (m) { const y = +m[1]; if (y < 1900 || y > 2200) return ""; }
  return v;
}
function csvField(v) {
  if (v === "") return ""; // unquoted empty -> NULL (COPY ... NULL '')
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

// Per-file plan: source file, line splitter, and CSV-key -> db-column mapping.
const debtorMap = [["UCC1_NUM","ucc1_num"],["UCC3_NUM","ucc3_num"],["DEBTOR_TYPE","debtor_type"],
  ["ORG_NAME","org_name"],["LAST_NAME","last_name"],["FIRST_NAME","first_name"],["MIDDLE_NAME","middle_name"],
  ["SUFFIX","suffix"],["ADDR1","addr1"],["ADDR2","addr2"],["ADDR3","addr3"],["CITY","city"],["STATE","state"],
  ["POSTAL_CODE","postal_code"],["COUNTRY","country"]];

const PLAN = [
  { table: "ucc_amendments", file: join(UCC, "FilingAmendments.csv"), split: splitUcc,
    map: [["UCC1_NUM","ucc1_num"],["UCC3_NUM","ucc3_num"],["ACTION_TYPE","action_type"]] },
  { table: "ucc_secured_parties", file: join(UCC, "SecuredParties.csv"), split: splitUcc,
    map: debtorMap.map(([k,c]) => k === "DEBTOR_TYPE" ? ["SECURED_PARTY_TYPE","party_type"] : [k,c]) },
  { table: "ucc_debtors", file: join(UCC, "Debtors.csv"), split: splitUcc, map: debtorMap },
  { table: "ucc_filings", file: join(UCC, "Filings.csv"), split: splitUcc,
    map: [["UCC1_NUM","ucc1_num"],["UCC3_NUM","ucc3_num"],["FILING_DATE","filing_date"],["PROCESSED_DATE","processed_date"],
      ["ACTION_TYPE","action_type"],["ALT_DESIGNATION_TYPE_ID","alt_designation"],["FILING_TYPE_ID","filing_type_id"],
      ["LAPSE_DATE","lapse_date"],["PAGE_COUNT","page_count"]] },
  { table: "be_agents", file: join(BE, "Agents.csv"), split: splitBe,
    map: [["ENTITY_NAME","entity_name"],["ENTITY_NUM","entity_num"],["ORG_NAME","org_name"],["FIRST_NAME","first_name"],
      ["MIDDLE_NAME","middle_name"],["LAST_NAME","last_name"],["PHYSICAL_ADDRESS1","addr1"],["PHYSICAL_CITY","city"],
      ["PHYSICAL_STATE","state"],["PHYSICAL_POSTAL_CODE","postal_code"],["AGENT_TYPE","agent_type"]] },
  { table: "be_principals", file: join(BE, "Principals.csv"), split: splitBe,
    map: [["ENTITY_NAME","entity_name"],["ENTITY_NUM","entity_num"],["ORG_NAME","org_name"],["FIRST_NAME","first_name"],
      ["MIDDLE_NAME","middle_name"],["LAST_NAME","last_name"],["POSITION_TYPE","position_type"],["ADDRESS1","addr1"],
      ["CITY","city"],["STATE","state"],["POSTAL_CODE","postal_code"]] },
  { table: "be_entities", file: join(BE, "Filings.csv"), split: splitBe,
    map: [["ENTITY_NAME","entity_name"],["ENTITY_NUM","entity_num"],["INITIAL_FILING_DATE","initial_filing_date"],
      ["JURISDICTION","jurisdiction"],["ENTITY_STATUS","entity_status"],["STANDING_SOS","standing_sos"],
      ["ENTITY_TYPE","entity_type"],["FILING_TYPE","filing_type"],["LLC_MANAGEMENT_STRUCTURE","llc_management_structure"],
      ["LAST_SI_FILE_DATE","last_si_file_date"],["PRINCIPAL_ADDRESS","principal_addr1"],["PRINCIPAL_ADDRESS2","principal_addr2"],
      ["PRINCIPAL_CITY","principal_city"],["PRINCIPAL_STATE","principal_state"],["PRINCIPAL_POSTAL_CODE","principal_postal"]] },
];

// Yields ready-to-COPY csv lines (and counts rows) for one file.
async function* csvRows(plan, counter) {
  const rl = createInterface({ input: createReadStream(plan.file), crlfDelay: Infinity });
  let idx = null;
  for await (const line of rl) {
    if (!line) continue;
    if (!idx) { const h = plan.split(line); idx = plan.map.map(([k]) => h.indexOf(k)); continue; }
    const vals = plan.split(line);
    const out = idx.map((i) => csvField(san(i >= 0 ? (vals[i] ?? "") : "")));
    counter.n++;
    if (counter.n % 1000000 === 0) process.stdout.write(`    ...${(counter.n / 1e6).toFixed(0)}M rows\n`);
    yield out.join(",") + "\n";
    if (process.env.DRY_LIMIT && counter.n >= +process.env.DRY_LIMIT) { rl.close(); return; }
  }
}

const BATCH = +(process.env.BATCH || 50000); // rows per COPY (lower if instance throttles)

// Module-level connection so we can drop & recreate it on any failure/hang.
let SQL, URL;
async function connect() {
  SQL = postgres(URL, { prepare: false, ssl: "require", max: 1, idle_timeout: 0, connect_timeout: 30 });
  await SQL`SET statement_timeout = 0`;
}
async function reconnect() {
  try { await SQL.end({ timeout: 5 }); } catch { /* ignore */ }
  await connect();
}
const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms))]);

// BURST-LOAD: detect a stall fast, then cool down to let the disk I/O budget
// refill, then resume. Survives the ~2.4GB disk-throughput throttle for free.
const STALL_TIMEOUT = +(process.env.STALL_TIMEOUT || 45000); // detect a stall in 45s
const COOLDOWN_MS = +(process.env.COOLDOWN || 360000);       // 6 min budget refill
const MAX_COOLDOWNS = +(process.env.MAX_COOLDOWNS || 20);
const THROTTLE_MS = +(process.env.THROTTLE_MS || 0); // delay between batches to stay under the IPv4 ingest cap
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function copyBatch(table, cols, data) {
  let cooldowns = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      const w = await SQL.unsafe(`COPY ${table} (${cols}) FROM STDIN WITH (FORMAT csv, NULL '')`).writable();
      await withTimeout(pipeline(Readable.from([data]), w), STALL_TIMEOUT, "copy-batch");
      return;
    } catch (e) {
      await reconnect();
      if (attempt % 2 === 1) {
        // first, a quick retry in case it was a transient blip
        console.error(`    retry on ${table} (${e.code || e.message})`);
        await sleep(4000);
      } else {
        // still failing -> I/O budget depleted -> cool down to let it refill
        if (++cooldowns > MAX_COOLDOWNS) throw e;
        console.error(`    I/O budget depleted — cooling down ${COOLDOWN_MS / 60000}min (cooldown #${cooldowns})`);
        await sleep(COOLDOWN_MS);
      }
    }
  }
}

// Run a DDL/SQL statement with timeout + reconnect-retry.
async function runDDL(text, ms = 1800000) {
  for (let attempt = 1; ; attempt++) {
    try { await withTimeout(SQL.unsafe(text), ms, "ddl"); return; }
    catch (e) { if (attempt >= 4) throw e; console.error(`    ddl retry ${attempt} (${e.code || e.message})`); await reconnect(); }
  }
}

// Stream a file and load it in chunked COPY batches, skipping `skip` data rows
// that are already loaded (resume support).
async function loadFile(plan, skip = 0) {
  const cols = plan.map.map(([, c]) => c).join(",");
  const rl = createInterface({ input: createReadStream(plan.file), crlfDelay: Infinity });
  let idx = null, batch = [], seen = 0, loaded = 0;
  for await (const line of rl) {
    if (!line) continue;
    if (!idx) { const h = plan.split(line); idx = plan.map.map(([k]) => h.indexOf(k)); continue; }
    seen++;
    if (seen <= skip) continue; // already in the DB from a previous run
    const vals = plan.split(line);
    batch.push(idx.map((i) => csvField(san(i >= 0 ? (vals[i] ?? "") : ""))).join(",") + "\n");
    loaded++;
    if (batch.length >= BATCH) {
      await copyBatch(plan.table, cols, batch.join(""));
      batch = [];
      if (THROTTLE_MS) await sleep(THROTTLE_MS); // pace under the IPv4 ingest budget
      if ((skip + loaded) % 1000000 < BATCH) console.error(`    ...${((skip + loaded) / 1e6).toFixed(1)}M rows (${plan.table})`);
    }
  }
  if (batch.length) await copyBatch(plan.table, cols, batch.join(""));
  return loaded;
}

async function main() {
  const dry = !!process.env.DRY_RUN;
  if (dry) {
    console.log("DRY RUN — parsing files only, no database.\n");
    for (const plan of PLAN) {
      const t = Date.now(); const counter = { n: 0 }; let sample = "";
      for await (const row of csvRows(plan, counter)) { if (!sample) sample = row.trim(); }
      console.log(`${plan.table.padEnd(20)} ${counter.n.toLocaleString().padStart(12)} rows  (${((Date.now()-t)/1000).toFixed(0)}s)`);
      console.log(`    sample: ${sample.slice(0, 160)}`);
    }
    return;
  }

  URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
  if (!URL) throw new Error("Set LOAD_DATABASE_URL (session pooler) or DATABASE_URL in web/.env.local");
  await connect();

  // FRESH=1 wipes and reloads; otherwise resume (keep loaded rows, continue).
  if (process.env.FRESH) {
    console.error("FRESH load: dropping tables...");
    await runDDL(`DROP TABLE IF EXISTS ${TABLES.join(", ")} CASCADE;`);
  } else {
    console.error("RESUME mode: keeping already-loaded rows.");
  }
  await runDDL(readFileSync(join(WEB, "db", "01-tables.sql"), "utf8")); // CREATE TABLE IF NOT EXISTS

  for (const plan of PLAN) {
    const t = Date.now();
    const have = Number((await SQL.unsafe(`SELECT count(*)::bigint n FROM ${plan.table}`))[0].n);
    console.error(`COPY -> ${plan.table} (already have ${have.toLocaleString()}, skipping those) ...`);
    const n = await loadFile(plan, have);
    console.error(`  ${plan.table.padEnd(20)} +${n.toLocaleString()} new rows in ${((Date.now()-t)/1000).toFixed(0)}s`);
  }

  console.error("Building indexes (one at a time)...");
  const idxStmts = readFileSync(join(WEB, "db", "02-indexes.sql"), "utf8")
    .split(";").map((s) => s.trim()).filter((s) => s && !s.startsWith("--"));
  for (const st of idxStmts) { console.error(`  ${st.slice(0, 64)}`); await runDDL(st); }
  console.error("Loading exclusion filters...");
  await runDDL(readFileSync(join(WEB, "db", "exclusions.sql"), "utf8"));

  // Make tables durable (UNLOGGED -> LOGGED). Heavy I/O, so per-table with retry.
  // Skip with NOLOG=1 to keep them unlogged for now (faster, but wiped on a DB restart).
  if (!process.env.NOLOG) {
    console.error("Converting tables to LOGGED (durable)...");
    for (const t of TABLES) { console.error(`  SET LOGGED ${t}`); await runDDL(`ALTER TABLE ${t} SET LOGGED`); }
  }

  const size = await SQL`SELECT pg_size_pretty(pg_database_size(current_database())) AS s`;
  console.error(`\nDone. Database size: ${size[0].s}`);
  await SQL.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
