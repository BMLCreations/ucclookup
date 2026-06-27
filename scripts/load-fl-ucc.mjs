// Load Florida UCC bulk data (pipe-delimited CSVs) into the shared ucc_* tables,
// tagged juris='FL'. FL's shape differs from CA: UCC-1 originals live in `filings`
// (with FilingStatus + FilingExpDate baked in) and UCC-3 actions in `events`.
// Strategy: COPY each file verbatim into an UNLOGGED staging table, then map it
// into ucc_filings / ucc_debtors / ucc_secured_parties / ucc_amendments in SQL so
// every downstream summary/profile table regenerates uniformly.
//
// Idempotent: deletes existing juris='FL' rows first, so it's safe to re-run.
// Usage:  DATABASE_URL=... node scripts/load-fl-ucc.mjs [dir]
import postgres from "postgres";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set LOAD_DATABASE_URL or DATABASE_URL"); process.exit(1); }
const DIR = process.argv[2] || "C:/Users/brian/Downloads/fl_ucc";
const sql = postgres(URL, { prepare: false, ssl: "require", max: 1, connect_timeout: 30, idle_timeout: 0 });
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

// Resolve the dated filename (e.g. filings_full20260618.csv) from a prefix.
function findFile(prefix) {
  const hit = fs.readdirSync(DIR).find((f) => f.startsWith(prefix) && f.endsWith(".csv"));
  if (!hit) throw new Error(`No file matching ${prefix}*.csv in ${DIR}`);
  return path.join(DIR, hit);
}

async function copyInto(table, file) {
  const s = Date.now();
  log(`COPY  ${table} <- ${path.basename(file)}`);
  // pg-copy-streams handles backpressure reliably on large files (postgres.js's
  // own COPY writable stalls past ~300 MB). These are standard CSV: pipe-delimited
  // with '"'-quoted name fields (escaped as ""), so use default CSV quoting.
  // Strip sslmode from the URL so our explicit ssl object (no cert verification —
  // DO uses a self-signed chain) takes effect rather than pg's verify-full default.
  const cleanUrl = URL.replace(/([?&])sslmode=[^&]*/gi, "$1").replace(/[?&]+$/, "");
  const client = new pg.Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const stream = client.query(copyFrom(`COPY ${table} FROM STDIN WITH (FORMAT csv, DELIMITER '|', HEADER true)`));
    await pipeline(fs.createReadStream(file, { highWaterMark: 1 << 20 }), stream);
  } finally {
    await client.end();
  }
  const n = await sql.unsafe(`SELECT count(*)::bigint c FROM ${table}`);
  log(`  ${Number(n[0].c).toLocaleString()} rows in ${((Date.now() - s) / 1000).toFixed(0)}s`);
}

// Parse FL MM/DD/YYYY only when well-formed; otherwise NULL.
const D = (col) => `CASE WHEN ${col} ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(${col},'MM/DD/YYYY') END`;

try {
  await sql.unsafe("SET statement_timeout=0");
  await sql.unsafe("SET work_mem='256MB'");
  await sql.unsafe("SET maintenance_work_mem='512MB'");
  await sql.unsafe("SET synchronous_commit=off");

  // ---- staging tables (text columns, in CSV order) ----
  log("Creating staging tables");
  await sql.unsafe(`
    DROP TABLE IF EXISTS s_fil, s_deb, s_sec, s_evt;
    CREATE UNLOGGED TABLE s_fil (ucc1 text, filing_date text, pages text, tot_pages text, status text,
      cancel_date text, exp_date text, trans_util text, event_cnt text, tot_deb text, tot_sec text, cur_deb text, cur_sec text);
    CREATE UNLOGGED TABLE s_deb (ucc1 text, name text, fmt text, a1 text, a2 text, city text, state text,
      zip text, country text, refnum text, rel text, orig text, status text);
    CREATE UNLOGGED TABLE s_sec (ucc1 text, name text, fmt text, a1 text, a2 text, city text, state text,
      zip text, country text, refnum text, rel text, orig text, status text);
    CREATE UNLOGGED TABLE s_evt (ucc3 text, ucc1 text, action_cnt text, seq text, pages text, event_date text,
      action_seq text, code text, name_type text, name text, a1 text, a2 text, city text, state text,
      zip text, country text, old_seq text, new_seq text, verbage text);
  `);

  await copyInto("s_fil", findFile("filings_full"));
  await copyInto("s_deb", findFile("debtors_full"));
  await copyInto("s_sec", findFile("secureds_full"));
  await copyInto("s_evt", findFile("events_full"));

  // ---- clear prior FL rows (idempotent) ----
  log("Clearing any prior juris='FL' rows");
  await sql.unsafe(`DELETE FROM ucc_filings WHERE juris='FL';
                    DELETE FROM ucc_debtors WHERE juris='FL';
                    DELETE FROM ucc_secured_parties WHERE juris='FL';
                    DELETE FROM ucc_amendments WHERE juris='FL';`);

  // ---- map staging -> real tables ----
  // FL filing numbers are prefixed 'FL:' so they never collide with CA's numbering
  // space — keeps every f.ucc1_num=d.ucc1_num join naturally state-isolated.
  log("INSERT ucc_filings");
  await sql.unsafe(`
    INSERT INTO ucc_filings (ucc1_num, ucc3_num, filing_date, action_type, filing_type_id, lapse_date, page_count, juris)
    SELECT 'FL:'||ucc1, 'FL:'||ucc1, ${D("filing_date")}, 'Lien Financing Stmt', 'UCC', ${D("exp_date")},
           nullif(tot_pages,'')::int, 'FL'
    FROM s_fil WHERE ucc1 <> ''`);

  log("INSERT ucc_debtors");
  await sql.unsafe(`
    INSERT INTO ucc_debtors (ucc1_num, ucc3_num, debtor_type, org_name, last_name, first_name, middle_name,
                             addr1, addr2, city, state, postal_code, country, juris)
    SELECT 'FL:'||ucc1, 'FL:'||ucc1,
           CASE WHEN fmt='P' THEN 'Individual' ELSE 'Organization' END,
           CASE WHEN fmt='P' THEN NULL ELSE btrim(name) END,
           CASE WHEN fmt='P' THEN (regexp_split_to_array(btrim(name),'[[:space:]]+'))[1] END,
           CASE WHEN fmt='P' THEN (regexp_split_to_array(btrim(name),'[[:space:]]+'))[2] END,
           CASE WHEN fmt='P' THEN nullif(array_to_string((regexp_split_to_array(btrim(name),'[[:space:]]+'))[3:],' '),'') END,
           nullif(a1,''), nullif(a2,''), nullif(city,''), nullif(state,''), nullif(zip,''), nullif(country,''), 'FL'
    FROM s_deb WHERE ucc1 <> '' AND btrim(name) <> ''`);

  log("INSERT ucc_secured_parties");
  await sql.unsafe(`
    INSERT INTO ucc_secured_parties (ucc1_num, ucc3_num, party_type, org_name,
                                     addr1, addr2, city, state, postal_code, country, juris)
    SELECT 'FL:'||ucc1, 'FL:'||ucc1, 'Secured Party', btrim(name),
           nullif(a1,''), nullif(a2,''), nullif(city,''), nullif(state,''), nullif(zip,''), nullif(country,''), 'FL'
    FROM s_sec WHERE ucc1 <> '' AND btrim(name) <> ''`);

  log("INSERT ucc_amendments (terminations)");
  await sql.unsafe(`
    INSERT INTO ucc_amendments (ucc1_num, ucc3_num, action_type, juris)
    SELECT DISTINCT 'FL:'||ucc1, 'FL:'||ucc3, 'Termination', 'FL'
    FROM s_evt WHERE code = 'T' AND ucc1 <> ''`);

  log("Dropping staging");
  await sql.unsafe(`DROP TABLE IF EXISTS s_fil, s_deb, s_sec, s_evt`);

  // ---- report ----
  const r = await sql`
    SELECT 'filings' t, count(*)::bigint n FROM ucc_filings WHERE juris='FL'
    UNION ALL SELECT 'debtors-org', count(*) FROM ucc_debtors WHERE juris='FL' AND debtor_type='Organization'
    UNION ALL SELECT 'debtors-ind', count(*) FROM ucc_debtors WHERE juris='FL' AND debtor_type='Individual'
    UNION ALL SELECT 'secured', count(*) FROM ucc_secured_parties WHERE juris='FL'
    UNION ALL SELECT 'terminations', count(*) FROM ucc_amendments WHERE juris='FL'
    UNION ALL SELECT 'active(exp>now)', count(*) FROM ucc_filings WHERE juris='FL' AND lapse_date > now()`;
  log("FL load complete:");
  for (const x of r) log(`  ${x.t.padEnd(16)} ${Number(x.n).toLocaleString()}`);
  log("ALL DONE ✅");
} catch (e) {
  log("ABORTED: " + e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
