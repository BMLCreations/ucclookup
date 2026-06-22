// Multi-signal PERSON entity resolution (v1).
// Problem: grouping principals by NAME alone merges unrelated people who share a
// common name ("John Smith owns 314 companies"). Fix: identity = name + address,
// with hub-address filtering so a shared registered-agent / big-office address
// never merges different people.
//
// Signals used (v1): person name (blocking key) + normalized address (link),
//   minus HUB addresses (used by > HUB_MAX distinct names = agent services/offices).
// Output: er_persons (one row per resolved person -> their companies).
// Future: add co-principal / shared-agent / UCC-individual-debtor edges (v2).
//
// RESUMABLE: skips tables that already exist; REFRESH=1 forces full rebuild.
import postgres from "postgres";

const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set LOAD_DATABASE_URL or DATABASE_URL"); process.exit(1); }
const REFRESH = !!process.env.REFRESH;
const HUB_MAX = +(process.env.HUB_MAX || 25); // addr shared by > this many distinct names = hub
const PRO_MAX = +(process.env.PRO_MAX || 50); // person on > this many companies = professional/nominee (not a real owner)
const sql = postgres(URL, { prepare: false, ssl: "require", max: 1, connect_timeout: 30, idle_timeout: 0 });
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

async function step(name, q) {
  const s = Date.now();
  log("START " + name);
  try { await sql.unsafe(q); log(`DONE  ${name} in ${((Date.now() - s) / 1000).toFixed(1)}s`); }
  catch (e) { log(`FAIL  ${name}: ${e.message}`); throw e; }
}
async function exists(t) { const r = await sql`SELECT to_regclass(${"public." + t}) x`; return !!r[0].x; }
async function build(table, ddl, idx = []) {
  if (!REFRESH && (await exists(table))) { log(`SKIP  ${table} (already built)`); return; }
  if (REFRESH) await sql.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  await step(table, ddl);
  for (const i of idx) await step(`  index ${table}`, i);
}

try {
  await sql.unsafe("SET statement_timeout=0");
  await sql.unsafe("SET work_mem='256MB'");
  await sql.unsafe("SET maintenance_work_mem='512MB'");
  await sql.unsafe("SET max_parallel_workers_per_gather=4");
  await sql.unsafe("SET max_parallel_maintenance_workers=4");
  await step("pg_trgm extension", "CREATE EXTENSION IF NOT EXISTS pg_trgm");

  // 1. Stage: normalized person name + normalized address per principal record.
  //    Address: upper, strip punctuation, drop street-type words (ST/AVE/etc.),
  //    collapse spaces, + city/state/zip5. addr_key NULL when no street address.
  await build("er_stage", `
    CREATE TABLE er_stage AS
    SELECT entity_num, entity_name, first_disp, last_disp, name_norm, cityu, stateu,
           CASE WHEN addr1c IS NOT NULL THEN addr1c || '|' || cityu || '|' || stateu || '|' || zip5 END AS addr_key
    FROM (
      SELECT entity_num, entity_name,
        initcap(lower(btrim(first_name))) AS first_disp,
        initcap(lower(btrim(last_name)))  AS last_disp,
        upper(btrim(first_name)) || ' ' || upper(btrim(last_name)) AS name_norm,
        NULLIF(btrim(regexp_replace(
          regexp_replace(
            regexp_replace(upper(coalesce(addr1,'')), '[^A-Z0-9 ]', ' ', 'g'),
            '\\m(STREET|AVENUE|ROAD|DRIVE|BOULEVARD|SUITE|APARTMENT|LANE|COURT|PLACE|UNIT)\\M', ' ', 'g'),
          '\\s+', ' ', 'g')), '') AS addr1c,
        upper(btrim(coalesce(city,'')))  AS cityu,
        upper(btrim(coalesce(state,''))) AS stateu,
        left(regexp_replace(coalesce(postal_code,''), '[^0-9]', '', 'g'), 5) AS zip5
      FROM be_principals
      WHERE btrim(first_name) <> '' AND btrim(last_name) <> ''
    ) x`, ["CREATE INDEX ON er_stage (addr_key)"]);

  // 2. Hub addresses — used by too many distinct names to identify a person.
  await build("er_hub_addr", `
    CREATE TABLE er_hub_addr AS
    SELECT addr_key FROM er_stage WHERE addr_key IS NOT NULL
    GROUP BY addr_key HAVING count(DISTINCT name_norm) > ${HUB_MAX}`,
    ["CREATE INDEX ON er_hub_addr (addr_key)"]);

  // 3. Resolved people. person_key = name + non-hub address; records with no usable
  //    address stay separate per entity (conservative: don't merge without evidence).
  await build("er_persons", `
    CREATE TABLE er_persons AS
    WITH keyed AS (
      SELECT s.entity_num, s.entity_name, s.first_disp, s.last_disp, s.name_norm, s.cityu, s.stateu,
        CASE WHEN s.addr_key IS NOT NULL AND h.addr_key IS NULL
             THEN s.name_norm || '|' || s.addr_key
             ELSE s.name_norm || '|ent:' || s.entity_num END AS person_key
      FROM er_stage s LEFT JOIN er_hub_addr h ON h.addr_key = s.addr_key
    )
    SELECT person_key,
           max(first_disp) AS first, max(last_disp) AS last,
           max(cityu) AS city, max(stateu) AS state,
           count(DISTINCT entity_num)::int AS companies,
           (count(DISTINCT entity_num) > ${PRO_MAX}) AS professional,
           string_agg(DISTINCT entity_name, '  |  ') AS company_list
    FROM keyed GROUP BY person_key`,
    [
      "CREATE INDEX ON er_persons (professional, companies DESC)",
      "CREATE INDEX er_persons_name_trgm ON er_persons USING gin (upper(coalesce(first,'')||' '||coalesce(last,'')) gin_trgm_ops)",
    ]);

  log("ALL DONE ✅");
} catch (e) {
  log("ABORTED: " + e.message);
} finally {
  await sql.end();
}
