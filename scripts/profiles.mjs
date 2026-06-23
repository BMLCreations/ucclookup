// Phase 1 data foundation for unified search + profiles.
// Builds prof_business: ONE row per normalized business name (the businesses that
// appear as UCC org debtors), with denormalized stats so the search can filter on
// "# filings + date window" instantly, and profiles can read a business's headline
// numbers without scanning. Junk/excluded names are dropped. Resumable (REFRESH=1).
import postgres from "postgres";

const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set LOAD_DATABASE_URL or DATABASE_URL"); process.exit(1); }
const REFRESH = !!process.env.REFRESH;
const sql = postgres(URL, { prepare: false, ssl: "require", max: 1, connect_timeout: 30, idle_timeout: 0 });
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
async function step(name, q) { const s = Date.now(); log("START " + name); try { await sql.unsafe(q); log(`DONE  ${name} in ${((Date.now() - s) / 1000).toFixed(1)}s`); } catch (e) { log(`FAIL  ${name}: ${e.message}`); throw e; } }
async function exists(t) { const r = await sql`SELECT to_regclass(${"public." + t}) x`; return !!r[0].x; }

try {
  await sql.unsafe("SET statement_timeout=0");
  await sql.unsafe("SET work_mem='256MB'");
  await sql.unsafe("SET maintenance_work_mem='512MB'");
  await sql.unsafe("SET max_parallel_workers_per_gather=4");
  await sql.unsafe("SET max_parallel_maintenance_workers=4");
  await step("pg_trgm", "CREATE EXTENSION IF NOT EXISTS pg_trgm");

  if (REFRESH || !(await exists("prof_business"))) {
    await sql.unsafe("DROP TABLE IF EXISTS prof_business");
    await step("prof_business", `
      CREATE TABLE prof_business AS
      WITH liens AS (
        SELECT d.ucc1_num,
               normalize_name(d.org_name) AS biz_norm,
               d.org_name AS biz_name,
               nullif(d.city,'')  AS city,
               nullif(d.state,'') AS state,
               f.filing_date,
               normalize_name(sp.org_name) AS funder_norm
        FROM ucc_debtors d
        JOIN ucc_filings f ON f.ucc1_num = d.ucc1_num AND f.ucc3_num = d.ucc3_num
             AND f.filing_type_id = 'UCC' AND f.action_type = 'Lien Financing Stmt'
        LEFT JOIN ucc_secured_parties sp ON sp.ucc1_num = d.ucc1_num AND sp.ucc3_num = d.ucc3_num AND sp.org_name <> ''
        WHERE d.debtor_type = 'Organization' AND d.org_name <> '' AND normalize_name(d.org_name) IS NOT NULL
      )
      SELECT l.biz_norm,
             max(l.biz_name) AS biz_name,
             (array_agg(l.city  ORDER BY l.filing_date DESC NULLS LAST) FILTER (WHERE l.city  IS NOT NULL))[1] AS city,
             (array_agg(l.state ORDER BY l.filing_date DESC NULLS LAST) FILTER (WHERE l.state IS NOT NULL))[1] AS state,
             count(DISTINCT l.ucc1_num)::int AS ucc_count,
             count(DISTINCT l.ucc1_num) FILTER (WHERE l.filing_date > now() - interval '3 months')::int  AS ucc_3mo,
             count(DISTINCT l.ucc1_num) FILTER (WHERE l.filing_date > now() - interval '6 months')::int  AS ucc_6mo,
             count(DISTINCT l.ucc1_num) FILTER (WHERE l.filing_date > now() - interval '12 months')::int AS ucc_12mo,
             max(l.filing_date)::date AS last_filing,
             count(DISTINCT l.funder_norm) FILTER (WHERE l.funder_norm IS NOT NULL)::int AS distinct_funders
      FROM liens l
      LEFT JOIN sum_excluded_norm e ON e.nm_norm = l.biz_norm
      WHERE e.nm_norm IS NULL
      GROUP BY l.biz_norm`);
    await step("  idx ucc_count",  "CREATE INDEX ON prof_business (ucc_count DESC)");
    await step("  idx ucc_6mo",    "CREATE INDEX ON prof_business (ucc_6mo DESC)");
    await step("  idx ucc_12mo",   "CREATE INDEX ON prof_business (ucc_12mo DESC)");
    await step("  idx funders",    "CREATE INDEX ON prof_business (distinct_funders DESC)");
    await step("  idx biz_norm",   "CREATE INDEX ON prof_business (biz_norm)");
    await step("  idx name_trgm",  "CREATE INDEX ON prof_business USING gin (biz_name gin_trgm_ops)");
  } else log("SKIP prof_business (exists)");

  const c = await sql`SELECT count(*)::int n, max(ucc_count) mx FROM prof_business`;
  log(`prof_business: ${c[0].n.toLocaleString()} businesses, max filings on one = ${c[0].mx}`);
  log("ALL DONE ✅");
} catch (e) { log("ABORTED: " + e.message); } finally { await sql.end(); }