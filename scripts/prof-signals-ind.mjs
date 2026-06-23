// Finishes prof_individual active_liens / tax_liens (the business half already ran).
// Runs WITHOUT parallel query — the parallel hash exhausted shared memory on the
// smaller tier. Single-threaded is slower but fits. Idempotent.
import postgres from "postgres";

const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set DATABASE_URL"); process.exit(1); }
const sql = postgres(URL, { prepare: false, ssl: "require", max: 1, connect_timeout: 30, idle_timeout: 0 });
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
async function step(name, q) { const s = Date.now(); log("START " + name); try { await sql.unsafe(q); log(`DONE  ${name} in ${((Date.now() - s) / 1000).toFixed(1)}s`); } catch (e) { log(`FAIL  ${name}: ${e.message}`); throw e; } }

const TAX = "f.filing_type_id IN ('Notice of State Tax Lien','Notice of Federal Tax Lien','Judgment Lien') AND f.action_type = 'Lien Financing Stmt'";
const ACTIVE = "count(DISTINCT d.ucc1_num) FILTER (WHERE NOT le.terminated AND (le.eff_lapse IS NULL OR le.eff_lapse >= now()))";
const NAMEKEY = `upper(btrim(d.first_name)) || ' ' || upper(btrim(d.last_name)) || '|' ||
                 coalesce(nullif(upper(btrim(d.city)),''),'') || '|' ||
                 coalesce(nullif(upper(btrim(d.state)),''),'')`;

try {
  await sql.unsafe("SET statement_timeout=0");
  await sql.unsafe("SET work_mem='128MB'");
  await sql.unsafe("SET max_parallel_workers_per_gather=0"); // avoid the /dev/shm exhaustion

  await step("temp lien_events", `
    CREATE TEMP TABLE lien_events AS
      SELECT ucc1_num, bool_or(action_type='Termination') AS terminated, max(lapse_date) AS eff_lapse
      FROM ucc_filings WHERE filing_type_id='UCC' GROUP BY ucc1_num;
    CREATE INDEX ON lien_events (ucc1_num)`);

  await step("temp ind_active", `
    CREATE TEMP TABLE ind_active AS
      SELECT ${NAMEKEY} AS person_key, ${ACTIVE} AS n
      FROM ucc_debtors d
      JOIN ucc_filings f ON f.ucc1_num=d.ucc1_num AND f.ucc3_num=d.ucc3_num
           AND f.filing_type_id='UCC' AND f.action_type='Lien Financing Stmt'
      JOIN lien_events le ON le.ucc1_num=d.ucc1_num
      WHERE d.debtor_type='Individual' AND btrim(d.first_name)<>'' AND btrim(d.last_name)<>''
      GROUP BY 1;
    CREATE INDEX ON ind_active (person_key)`);
  await step("temp ind_tax", `
    CREATE TEMP TABLE ind_tax AS
      SELECT ${NAMEKEY} AS person_key, count(DISTINCT f.ucc1_num) AS n
      FROM ucc_debtors d
      JOIN ucc_filings f ON f.ucc1_num=d.ucc1_num AND f.ucc3_num=d.ucc3_num
      WHERE d.debtor_type='Individual' AND btrim(d.first_name)<>'' AND btrim(d.last_name)<>'' AND ${TAX}
      GROUP BY 1;
    CREATE INDEX ON ind_tax (person_key)`);
  await step("update prof_individual active", `UPDATE prof_individual p SET active_liens=i.n FROM ind_active i WHERE p.person_key=i.person_key`);
  await step("update prof_individual tax",    `UPDATE prof_individual p SET tax_liens=i.n    FROM ind_tax i    WHERE p.person_key=i.person_key`);

  await step("ANALYZE", "ANALYZE prof_individual");
  const r = await sql`SELECT count(*) FILTER (WHERE tax_liens>0)::int tx, count(*) FILTER (WHERE active_liens>0)::int ac FROM prof_individual`;
  log(`prof_individual: ${r[0].ac.toLocaleString()} with active liens, ${r[0].tx.toLocaleString()} with tax liens/judgments`);
  log("ALL DONE ✅");
} catch (e) { log("ABORTED: " + e.message); } finally { await sql.end(); }