// Renewal radar: precompute next_expiry onto prof_business / prof_individual =
// the soonest UPCOMING expiration among the debtor's still-live (non-terminated)
// UCC liens. An advance maturing soon = a merchant about to seek new money, so
// Lead Gen can filter "renewing in the next N days" instantly. Idempotent; re-run
// after each data load. Single-threaded (parallel hash OOMs on the smaller tier).
import postgres from "postgres";

const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set DATABASE_URL"); process.exit(1); }
const sql = postgres(URL, { prepare: false, ssl: "require", max: 1, connect_timeout: 30, idle_timeout: 0 });
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
async function step(name, q) { const s = Date.now(); log("START " + name); try { await sql.unsafe(q); log(`DONE  ${name} in ${((Date.now() - s) / 1000).toFixed(1)}s`); } catch (e) { log(`FAIL  ${name}: ${e.message}`); throw e; } }

const NAMEKEY = `d.juris || ':' || upper(btrim(d.first_name)) || ' ' || upper(btrim(d.last_name)) || '|' ||
                 coalesce(nullif(upper(btrim(d.city)),''),'') || '|' ||
                 coalesce(nullif(upper(btrim(d.state)),''),'')`;

try {
  await sql.unsafe("SET statement_timeout=0");
  await sql.unsafe("SET work_mem='128MB'");
  await sql.unsafe("SET max_parallel_workers_per_gather=0");
  await sql.unsafe("DROP TABLE IF EXISTS lien_events, biz_renewal, ind_renewal"); // clear leftovers (UNLOGGED, survive reconnects)

  await step("add columns", `
    ALTER TABLE prof_business   ADD COLUMN IF NOT EXISTS next_expiry date;
    ALTER TABLE prof_individual ADD COLUMN IF NOT EXISTS next_expiry date`);

  await step("temp lien_events", `
    CREATE UNLOGGED TABLE lien_events AS
      SELECT ucc1_num, bool_or(action_type='Termination') AS terminated, max(lapse_date) AS eff_lapse
      FROM ucc_filings WHERE filing_type_id='UCC' GROUP BY ucc1_num;
    CREATE INDEX ON lien_events (ucc1_num)`);

  await step("temp biz_renewal", `
    CREATE UNLOGGED TABLE biz_renewal AS
      SELECT d.juris || ':' || normalize_name(d.org_name) AS biz_norm, min(le.eff_lapse)::date AS nx
      FROM ucc_debtors d
      JOIN ucc_filings f ON f.ucc1_num=d.ucc1_num AND f.ucc3_num=d.ucc3_num
           AND f.filing_type_id='UCC' AND f.action_type='Lien Financing Stmt'
      JOIN lien_events le ON le.ucc1_num=d.ucc1_num
      WHERE d.debtor_type='Organization' AND d.org_name<>''
            AND NOT le.terminated AND le.eff_lapse >= now()
      GROUP BY 1;
    CREATE INDEX ON biz_renewal (biz_norm)`);
  await step("update prof_business", `UPDATE prof_business p SET next_expiry=b.nx FROM biz_renewal b WHERE p.biz_norm=b.biz_norm`);

  await step("temp ind_renewal", `
    CREATE UNLOGGED TABLE ind_renewal AS
      SELECT ${NAMEKEY} AS person_key, min(le.eff_lapse)::date AS nx
      FROM ucc_debtors d
      JOIN ucc_filings f ON f.ucc1_num=d.ucc1_num AND f.ucc3_num=d.ucc3_num
           AND f.filing_type_id='UCC' AND f.action_type='Lien Financing Stmt'
      JOIN lien_events le ON le.ucc1_num=d.ucc1_num
      WHERE d.debtor_type='Individual' AND btrim(d.first_name)<>'' AND btrim(d.last_name)<>''
            AND NOT le.terminated AND le.eff_lapse >= now()
      GROUP BY 1;
    CREATE INDEX ON ind_renewal (person_key)`);
  await step("update prof_individual", `UPDATE prof_individual p SET next_expiry=i.nx FROM ind_renewal i WHERE p.person_key=i.person_key`);

  await step("indexes", `
    CREATE INDEX IF NOT EXISTS prof_business_nextexp   ON prof_business (next_expiry) WHERE next_expiry IS NOT NULL;
    CREATE INDEX IF NOT EXISTS prof_individual_nextexp ON prof_individual (next_expiry) WHERE next_expiry IS NOT NULL`);
  await step("ANALYZE", "ANALYZE prof_business; ANALYZE prof_individual");
  await sql.unsafe("DROP TABLE IF EXISTS lien_events, biz_renewal, ind_renewal"); // cleanup scratch

  const b = await sql`SELECT count(*) FILTER (WHERE next_expiry BETWEEN now() AND now()+interval '90 days')::int n FROM prof_business`;
  log(`prof_business: ${b[0].n.toLocaleString()} businesses with a lien expiring in the next 90 days`);
  log("ALL DONE ✅");
} catch (e) { log("ABORTED: " + e.message); } finally { await sql.end(); }
