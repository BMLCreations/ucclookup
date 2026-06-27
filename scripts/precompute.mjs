// Precompute summary tables + search indexes so the app's pages are instant.
// RESUMABLE: skips any summary table that already exists (so an interrupted build
// can be re-run cheaply). Set REFRESH=1 to force a full rebuild (weekly refresh).
// Reads LOAD_DATABASE_URL (or DATABASE_URL). Safe to re-run anytime.
import postgres from "postgres";

const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set LOAD_DATABASE_URL or DATABASE_URL"); process.exit(1); }
const REFRESH = !!process.env.REFRESH;
const sql = postgres(URL, { prepare: false, ssl: "require", max: 1, connect_timeout: 30, idle_timeout: 0 });
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

async function step(name, q) {
  const s = Date.now();
  log("START " + name);
  try { await sql.unsafe(q); log(`DONE  ${name} in ${((Date.now() - s) / 1000).toFixed(1)}s`); }
  catch (e) { log(`FAIL  ${name}: ${e.message}`); throw e; }
}
async function exists(table) {
  const r = await sql`SELECT to_regclass(${"public." + table}) x`;
  return !!r[0].x;
}
// Build a summary table (skip if it already exists, unless REFRESH=1), then its indexes.
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

  // 1. Materialize excluded normalized names once.
  // MATERIALIZED is critical: without it the planner inlines `pats` into the EXISTS
  // and recomputes normalize_name (3 regexes) over the patterns for EVERY one of
  // ~600K distinct names (~tens of millions of regex calls -> ~1hr on 2x data).
  // Materializing computes each normalization once, so the EXISTS is just cheap
  // substring LIKEs against 39 precomputed patterns.
  // Collapse the 39 exclusion patterns into ONE alternation regex applied once per
  // distinct name (vs the old correlated EXISTS re-running normalize_name per name —
  // ~40M regex calls, ~1hr on 2x data). Patterns are stripped to [A-Z0-9 ] so they
  // can't inject regex metacharacters. MATERIALIZED so each side computes once.
  await build("sum_excluded_norm", `
    CREATE TABLE sum_excluded_norm AS
    WITH raw AS MATERIALIZED (
      SELECT DISTINCT org_name AS nm FROM ucc_secured_parties WHERE org_name <> ''
      UNION
      SELECT DISTINCT org_name FROM ucc_debtors WHERE org_name <> '' AND debtor_type='Organization'
    ),
    pats AS MATERIALIZED (
      SELECT string_agg(DISTINCT regexp_replace(normalize_name(name), '[^A-Z0-9 ]', '', 'g'), '|') AS rx
      FROM excluded_names WHERE nullif(regexp_replace(normalize_name(name), '[^A-Z0-9 ]', '', 'g'),'') IS NOT NULL
    ),
    n AS MATERIALIZED (SELECT DISTINCT upper(nm) AS up, normalize_name(nm) AS nn FROM raw)
    SELECT n.nn AS nm_norm FROM n CROSS JOIN pats
    WHERE n.nn IS NOT NULL AND (
      n.up ~ '(SOVEREIGN|MONETARY FUTURE|HERITAGE FEDERATION|GLOBAL FUND FINANCIAL|CESTUI QUE|SECURED PARTY CREDITOR|LIVING TRUST|FAMILY TRUST|REVOCABLE TRUST|IRREVOCABLE|AS TRUSTEE)'
      OR (pats.rx IS NOT NULL AND n.nn ~ pats.rx)
    )`, ["CREATE INDEX ON sum_excluded_norm (nm_norm)"]);

  // 2. Dashboard stats.
  await build("sum_stats", `
    CREATE TABLE sum_stats AS
    SELECT 'UCC filings' AS label, count(*)::bigint AS n FROM ucc_filings
    UNION ALL SELECT 'Businesses (debtors)', count(DISTINCT normalize_name(org_name)) FROM ucc_debtors WHERE debtor_type='Organization'
    UNION ALL SELECT 'Funders', count(DISTINCT normalize_name(org_name)) FROM ucc_secured_parties WHERE org_name<>''
    UNION ALL SELECT 'CA companies on file', count(*) FROM be_entities
    UNION ALL SELECT 'Company principals', count(*) FROM be_principals`);

  // 3. Denormalized feed.
  await build("sum_leads", `
    CREATE TABLE sum_leads AS
    SELECT normalize_name(sp.org_name) AS funder_norm, sp.org_name AS funder_name,
           f.filing_date::date AS filed, d.org_name AS merchant_name,
           f.juris, d.city, d.state, d.postal_code
    FROM ucc_secured_parties sp
    JOIN ucc_filings f ON f.ucc1_num = sp.ucc1_num AND f.ucc3_num = sp.ucc3_num
    JOIN ucc_debtors d ON d.ucc1_num = sp.ucc1_num AND d.ucc3_num = sp.ucc3_num
                      AND d.debtor_type='Organization' AND d.org_name<>''
    WHERE sp.org_name<>'' AND f.filing_type_id='UCC' AND f.action_type='Lien Financing Stmt'
      AND normalize_name(sp.org_name) IS NOT NULL`, ["CREATE INDEX ON sum_leads (funder_norm, filed DESC)"]);

  // 4. Top funders (feed pick-list).
  await build("sum_funders", `
    CREATE TABLE sum_funders AS
    WITH raw AS (
      SELECT sp.org_name AS funder, normalize_name(sp.org_name) AS funder_norm, count(*)::int AS filings
      FROM ucc_secured_parties sp
      JOIN ucc_filings f ON f.ucc1_num = sp.ucc1_num AND f.ucc3_num = sp.ucc3_num
      WHERE sp.org_name <> '' AND f.filing_type_id='UCC' AND f.action_type='Lien Financing Stmt'
      GROUP BY sp.org_name
    )
    SELECT r.funder, r.funder_norm, r.filings
    FROM raw r LEFT JOIN sum_excluded_norm e ON e.nm_norm = r.funder_norm
    WHERE r.funder_norm IS NOT NULL AND e.nm_norm IS NULL`, ["CREATE INDEX ON sum_funders (filings DESC)"]);

  // 5. Stacking detector.
  await build("sum_stacked", `
    CREATE TABLE sum_stacked AS
    WITH events AS (
      SELECT ucc1_num, bool_or(action_type='Termination') AS terminated, max(lapse_date) AS eff_lapse,
             bool_or(action_type='Lien Financing Stmt' AND filing_type_id='UCC') AS is_ucc_initial
      FROM ucc_filings GROUP BY ucc1_num
    ),
    amend_term AS (SELECT DISTINCT ucc1_num FROM ucc_amendments WHERE action_type='Termination'),
    active AS (
      SELECT e.ucc1_num FROM events e
      LEFT JOIN amend_term a ON a.ucc1_num = e.ucc1_num
      WHERE e.is_ucc_initial AND NOT e.terminated AND a.ucc1_num IS NULL
        AND (e.eff_lapse IS NULL OR e.eff_lapse > now())
    ),
    lien AS (
      SELECT a.ucc1_num, d.juris || ':' || normalize_name(d.org_name) AS merchant_norm, max(d.org_name) AS merchant_name,
             normalize_name(s.org_name) AS funder_norm
      FROM active a
      JOIN ucc_debtors d         ON d.ucc1_num = a.ucc1_num AND d.debtor_type='Organization' AND d.org_name<>''
      JOIN ucc_secured_parties s ON s.ucc1_num = a.ucc1_num AND s.org_name<>''
      LEFT JOIN sum_excluded_norm ed ON ed.nm_norm = normalize_name(d.org_name)
      LEFT JOIN sum_excluded_norm es ON es.nm_norm = normalize_name(s.org_name)
      WHERE ed.nm_norm IS NULL AND es.nm_norm IS NULL
        AND normalize_name(d.org_name) IS NOT NULL AND normalize_name(s.org_name) IS NOT NULL
      GROUP BY a.ucc1_num, d.juris, normalize_name(d.org_name), normalize_name(s.org_name)
    )
    SELECT merchant_norm, max(merchant_name) AS merchant,
           count(DISTINCT funder_norm)::int AS distinct_funders,
           count(DISTINCT ucc1_num)::int    AS active_liens,
           string_agg(DISTINCT funder_norm, ', ') AS funders
    FROM lien GROUP BY merchant_norm
    HAVING count(DISTINCT funder_norm) >= 2`, ["CREATE INDEX ON sum_stacked (distinct_funders DESC, active_liens DESC)"]);

  // 6. Owner empires.
  await build("sum_empires", `
    CREATE TABLE sum_empires AS
    SELECT initcap(lower(first_name)) AS first, initcap(lower(last_name)) AS last,
           count(DISTINCT entity_num)::int AS companies,
           string_agg(DISTINCT entity_name, '  |  ') AS company_list
    FROM be_principals
    WHERE last_name<>'' AND first_name<>''
    GROUP BY upper(first_name), upper(last_name), initcap(lower(first_name)), initcap(lower(last_name))
    HAVING count(DISTINCT entity_num) >= 2`, ["CREATE INDEX ON sum_empires (companies DESC)"]);

  // 7. Trigram indexes for typed name search (IF NOT EXISTS = resumable).
  await step("trgm be_principals", "CREATE INDEX IF NOT EXISTS be_principals_name_trgm ON be_principals USING gin (upper(coalesce(first_name,'')||' '||coalesce(last_name,'')) gin_trgm_ops)");
  await step("trgm be_entities", "CREATE INDEX IF NOT EXISTS be_entities_name_trgm ON be_entities USING gin (normalize_name(entity_name) gin_trgm_ops)");

  log("ALL DONE ✅");
} catch (e) {
  log("ABORTED: " + e.message);
} finally {
  await sql.end();
}
