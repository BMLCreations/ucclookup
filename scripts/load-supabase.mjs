// One-time loader: pushes the California sample CSVs into Supabase Postgres.
// Run locally (NOT on Vercel):  npm run load
// Requires DATABASE_URL in web/.env.local (Supabase transaction-pooler URI).
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));     // web/scripts
const WEB = join(here, "..");                             // web
const ROOT = join(WEB, "..");                             // repo root (has data folders)
const UCC = join(ROOT, "UCCCalifornia");
const BE = join(ROOT, "BE Calofinia");

// ---- minimal CSV parsing (UCC "|" quoted, BE "*|*") ----
const readLines = (p) => readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.length);
const toObjects = (header, rows) =>
  rows.map((vals) => Object.fromEntries(header.map((h, i) => [h, (vals[i] ?? "").trim()])));
function parseUcc(p) {
  const split = (l) => l.split("|").map((f) => { f = f.trim(); return f.startsWith('"') && f.endsWith('"') ? f.slice(1, -1) : f; });
  const lines = readLines(p);
  return toObjects(split(lines[0]), lines.slice(1).map(split));
}
function parseBe(p) {
  const split = (l) => l.split("*|*");
  const lines = readLines(p);
  return toObjects(split(lines[0]).map((h) => h.trim()), lines.slice(1).map(split));
}

const TABLES = ["ucc_filings", "ucc_debtors", "ucc_secured_parties", "ucc_amendments",
  "be_entities", "be_principals", "be_agents", "excluded_names"];

// Empty -> null; also null out sentinel/out-of-range dates like "9999-12-31"
// ("never expires"), which overflow a timestamptz when a tz offset is applied.
function clean(v) {
  if (v === "" || v === undefined) return null;
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(v);
  if (m) {
    const y = +m[1];
    if (y < 1900 || y > 2200) return null;
  }
  return v;
}

async function insert(sql, table, mapping, rows) {
  const cols = mapping.map(([, c]) => c);
  const mapped = rows.map((r) => {
    const o = {};
    for (const [k, c] of mapping) o[c] = clean(r[k]);
    return o;
  });
  const BATCH = 1000;
  for (let i = 0; i < mapped.length; i += BATCH) {
    await sql`INSERT INTO ${sql(table)} ${sql(mapped.slice(i, i + BATCH), ...cols)}`;
  }
  return mapped.length;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set. Put it in web/.env.local");
  const sql = postgres(url, { prepare: false, ssl: "require" });

  console.log("Resetting schema...");
  await sql.unsafe(`DROP TABLE IF EXISTS ${TABLES.join(", ")} CASCADE;`);
  await sql.unsafe(readFileSync(join(WEB, "db", "schema.sql"), "utf8"));
  await sql.unsafe(readFileSync(join(WEB, "db", "exclusions.sql"), "utf8"));

  const debtorMap = [["UCC1_NUM","ucc1_num"],["UCC3_NUM","ucc3_num"],["DEBTOR_TYPE","debtor_type"],
    ["ORG_NAME","org_name"],["LAST_NAME","last_name"],["FIRST_NAME","first_name"],["MIDDLE_NAME","middle_name"],
    ["SUFFIX","suffix"],["ADDR1","addr1"],["ADDR2","addr2"],["ADDR3","addr3"],["CITY","city"],["STATE","state"],
    ["POSTAL_CODE","postal_code"],["COUNTRY","country"]];

  console.log("Loading UCC data...");
  console.log("  ucc_filings        ", await insert(sql, "ucc_filings", [["UCC1_NUM","ucc1_num"],["UCC3_NUM","ucc3_num"],
    ["FILING_DATE","filing_date"],["PROCESSED_DATE","processed_date"],["ACTION_TYPE","action_type"],
    ["ALT_DESIGNATION_TYPE_ID","alt_designation"],["FILING_TYPE_ID","filing_type_id"],["LAPSE_DATE","lapse_date"],
    ["PAGE_COUNT","page_count"]], parseUcc(join(UCC, "Filings.csv"))));
  console.log("  ucc_debtors        ", await insert(sql, "ucc_debtors", debtorMap, parseUcc(join(UCC, "Debtors.csv"))));
  console.log("  ucc_secured_parties", await insert(sql, "ucc_secured_parties",
    debtorMap.map(([k, c]) => (k === "DEBTOR_TYPE" ? ["SECURED_PARTY_TYPE","party_type"] : [k, c])),
    parseUcc(join(UCC, "SecuredParties.csv"))));
  console.log("  ucc_amendments     ", await insert(sql, "ucc_amendments",
    [["UCC1_NUM","ucc1_num"],["UCC3_NUM","ucc3_num"],["ACTION_TYPE","action_type"]],
    parseUcc(join(UCC, "FilingAmendments.csv"))));

  console.log("Loading business-entity data...");
  console.log("  be_entities        ", await insert(sql, "be_entities", [["ENTITY_NAME","entity_name"],["ENTITY_NUM","entity_num"],
    ["INITIAL_FILING_DATE","initial_filing_date"],["JURISDICTION","jurisdiction"],["ENTITY_STATUS","entity_status"],
    ["STANDING_SOS","standing_sos"],["ENTITY_TYPE","entity_type"],["FILING_TYPE","filing_type"],
    ["LLC_MANAGEMENT_STRUCTURE","llc_management_structure"],["LAST_SI_FILE_DATE","last_si_file_date"],
    ["PRINCIPAL_ADDRESS","principal_addr1"],["PRINCIPAL_ADDRESS2","principal_addr2"],["PRINCIPAL_CITY","principal_city"],
    ["PRINCIPAL_STATE","principal_state"],["PRINCIPAL_POSTAL_CODE","principal_postal"]], parseBe(join(BE, "Filings.csv"))));
  console.log("  be_principals      ", await insert(sql, "be_principals", [["ENTITY_NAME","entity_name"],["ENTITY_NUM","entity_num"],
    ["ORG_NAME","org_name"],["FIRST_NAME","first_name"],["MIDDLE_NAME","middle_name"],["LAST_NAME","last_name"],
    ["POSITION_TYPE","position_type"],["ADDRESS1","addr1"],["CITY","city"],["STATE","state"],["POSTAL_CODE","postal_code"]],
    parseBe(join(BE, "Principals.csv"))));
  console.log("  be_agents          ", await insert(sql, "be_agents", [["ENTITY_NAME","entity_name"],["ENTITY_NUM","entity_num"],
    ["ORG_NAME","org_name"],["FIRST_NAME","first_name"],["MIDDLE_NAME","middle_name"],["LAST_NAME","last_name"],
    ["PHYSICAL_ADDRESS1","addr1"],["PHYSICAL_CITY","city"],["PHYSICAL_STATE","state"],["PHYSICAL_POSTAL_CODE","postal_code"],
    ["AGENT_TYPE","agent_type"]], parseBe(join(BE, "Agents.csv"))));

  console.log("\nDone. Supabase is loaded.");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
