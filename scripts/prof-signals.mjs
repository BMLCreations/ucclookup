// Adds two list-triage signals to prof_business / prof_individual:
//   active_liens — # of the debtor's UCC liens still live (not terminated, not
//                  past their continued lapse date) — "how leveraged right now".
//   tax_liens    — # of state/federal tax liens + judgment liens against them — a
//                  distress signal — so Lead Gen / Search rows show it without a click.
// Computed once here (joins over millions of filings) and UPDATEd in, so the
// result lists stay instant. Idempotent: re-run after each data load. The status
// logic mirrors features.ts (Terminated > Lapsed-by-date > Active).
import postgres from "postgres";

const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set DATABASE_URL"); process.exit(1); }
const sql = postgres(URL, { prepare: false, ssl: "require", max: 1, connect_timeout: 30, idle_timeout: 0 });
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
async function step(name, q) { const s = Date.now(); log("START " + name); try { await sql.unsafe(q); log(`DONE  ${name} in ${((Date.now() - s) / 1000).toFixed(1)}s`); } catch (e) { log(`FAIL  ${name}: ${e.message}`); throw e; } }

const TAX = "f.filing_type_id IN ('Notice of State Tax Lien','Notice of Federal Tax Lien','Judgment Lien') AND f.action_type = 'Lien Financing Stmt'";

try {
  await sql.unsafe("SET statement_timeout=0");
  await sql.unsafe("SET work_mem='256MB'");
  await sql.unsafe("SET max_parallel_workers_per_gather=0"); // avoid /dev/shm OOM on the doubled (CA+FL) dataset
  // UNLOGGED (not TEMP) scratch tables survive a transient connection drop mid-run;
  // drop any leftovers from a prior interrupted run first.
  await sql.unsafe("DROP TABLE IF EXISTS lien_events, biz_active, biz_tax, ind_active, ind_tax");

  await step("add columns", `
    ALTER TABLE prof_business   ADD COLUMN IF NOT EXISTS active_liens int NOT NULL DEFAULT 0,
                                ADD COLUMN IF NOT EXISTS tax_liens    int NOT NULL DEFAULT 0;
    ALTER TABLE prof_individual ADD COLUMN IF NOT EXISTS active_liens int NOT NULL DEFAULT 0,
                                ADD COLUMN IF NOT EXISTS tax_liens    int NOT NULL DEFAULT 0`);

  // Per-lien UCC lifecycle (termination + furthest lapse), reused for both tables.
  await step("temp lien_events", `
    CREATE UNLOGGED TABLE lien_events AS
      SELECT ucc1_num, bool_or(action_type='Termination') AS terminated, max(lapse_date) AS eff_lapse
      FROM ucc_filings WHERE filing_type_id='UCC' GROUP BY ucc1_num;
    CREATE INDEX ON lien_events (ucc1_num)`);

  const ACTIVE = "count(DISTINCT d.ucc1_num) FILTER (WHERE NOT le.terminated AND (le.eff_lapse IS NULL OR le.eff_lapse >= now()))";

  // ── Businesses ──
  await step("temp biz_active", `
    CREATE UNLOGGED TABLE biz_active AS
      SELECT d.juris || ':' || normalize_name(d.org_name) AS biz_norm, ${ACTIVE} AS n
      FROM ucc_debtors d
      JOIN ucc_filings f ON f.ucc1_num=d.ucc1_num AND f.ucc3_num=d.ucc3_num
           AND f.filing_type_id='UCC' AND f.action_type='Lien Financing Stmt'
      JOIN lien_events le ON le.ucc1_num=d.ucc1_num
      WHERE d.debtor_type='Organization' AND d.org_name<>''
      GROUP BY 1;
    CREATE INDEX ON biz_active (biz_norm)`);
  await step("temp biz_tax", `
    CREATE UNLOGGED TABLE biz_tax AS
      SELECT d.juris || ':' || normalize_name(d.org_name) AS biz_norm, count(DISTINCT f.ucc1_num) AS n
      FROM ucc_debtors d
      JOIN ucc_filings f ON f.ucc1_num=d.ucc1_num AND f.ucc3_num=d.ucc3_num
      WHERE d.debtor_type='Organization' AND d.org_name<>'' AND ${TAX}
      GROUP BY 1;
    CREATE INDEX ON biz_tax (biz_norm)`);
  await step("update prof_business active", `UPDATE prof_business p SET active_liens=b.n FROM biz_active b WHERE p.biz_norm=b.biz_norm`);
  await step("update prof_business tax",    `UPDATE prof_business p SET tax_liens=b.n    FROM biz_tax b    WHERE p.biz_norm=b.biz_norm`);

  // ── Individuals (key = NAME|CITY|STATE, matching profiles.mjs) ──
  const NAMEKEY = `d.juris || ':' || upper(btrim(d.first_name)) || ' ' || upper(btrim(d.last_name)) || '|' ||
                   coalesce(nullif(upper(btrim(d.city)),''),'') || '|' ||
                   coalesce(nullif(upper(btrim(d.state)),''),'')`;
  await step("temp ind_active", `
    CREATE UNLOGGED TABLE ind_active AS
      SELECT ${NAMEKEY} AS person_key, ${ACTIVE} AS n
      FROM ucc_debtors d
      JOIN ucc_filings f ON f.ucc1_num=d.ucc1_num AND f.ucc3_num=d.ucc3_num
           AND f.filing_type_id='UCC' AND f.action_type='Lien Financing Stmt'
      JOIN lien_events le ON le.ucc1_num=d.ucc1_num
      WHERE d.debtor_type='Individual' AND btrim(d.first_name)<>'' AND btrim(d.last_name)<>''
      GROUP BY 1;
    CREATE INDEX ON ind_active (person_key)`);
  await step("temp ind_tax", `
    CREATE UNLOGGED TABLE ind_tax AS
      SELECT ${NAMEKEY} AS person_key, count(DISTINCT f.ucc1_num) AS n
      FROM ucc_debtors d
      JOIN ucc_filings f ON f.ucc1_num=d.ucc1_num AND f.ucc3_num=d.ucc3_num
      WHERE d.debtor_type='Individual' AND btrim(d.first_name)<>'' AND btrim(d.last_name)<>'' AND ${TAX}
      GROUP BY 1;
    CREATE INDEX ON ind_tax (person_key)`);
  await step("update prof_individual active", `UPDATE prof_individual p SET active_liens=i.n FROM ind_active i WHERE p.person_key=i.person_key`);
  await step("update prof_individual tax",    `UPDATE prof_individual p SET tax_liens=i.n    FROM ind_tax i    WHERE p.person_key=i.person_key`);

  await step("indexes", `
    CREATE INDEX IF NOT EXISTS prof_business_tax   ON prof_business (tax_liens DESC);
    CREATE INDEX IF NOT EXISTS prof_individual_tax ON prof_individual (tax_liens DESC)`);
  await step("ANALYZE", "ANALYZE prof_business; ANALYZE prof_individual");
  await sql.unsafe("DROP TABLE IF EXISTS lien_events, biz_active, biz_tax, ind_active, ind_tax"); // cleanup scratch

  const b = await sql`SELECT count(*) FILTER (WHERE tax_liens>0)::int tx, count(*) FILTER (WHERE active_liens>0)::int ac FROM prof_business`;
  log(`prof_business: ${b[0].ac.toLocaleString()} with active liens, ${b[0].tx.toLocaleString()} with tax liens/judgments`);
  log("ALL DONE ✅");
} catch (e) { log("ABORTED: " + e.message); } finally { await sql.end(); }