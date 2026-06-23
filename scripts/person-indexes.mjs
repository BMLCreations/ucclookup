// Functional indexes that make individual/person profiles fast.
// Person lookups match on the concatenated, normalized name expression
// (upper(btrim(first)) ' ' upper(btrim(last))) — same shape prof_individual's
// person_key uses — so the profile's filings + companies queries can seek
// instead of scanning ucc_debtors (5.9M) and be_principals (18.8M). Idempotent.
import postgres from "postgres";

const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set DATABASE_URL"); process.exit(1); }
const sql = postgres(URL, { prepare: false, ssl: "require", max: 1, connect_timeout: 30, idle_timeout: 0 });
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
async function step(name, q) { const s = Date.now(); log("START " + name); try { await sql.unsafe(q); log(`DONE  ${name} in ${((Date.now() - s) / 1000).toFixed(1)}s`); } catch (e) { log(`FAIL  ${name}: ${e.message}`); throw e; } }

try {
  await sql.unsafe("SET statement_timeout=0");
  await sql.unsafe("SET maintenance_work_mem='512MB'");
  await sql.unsafe("SET max_parallel_maintenance_workers=4");

  // UCC individual debtors, by normalized full name (partial: only individuals).
  await step("idx ucc_debtors indiv name", `
    CREATE INDEX IF NOT EXISTS idx_ucc_debtors_indiv_name
    ON ucc_debtors ((upper(btrim(first_name)) || ' ' || upper(btrim(last_name))))
    WHERE debtor_type = 'Individual'`);

  // CA business-registry principals, by normalized full name.
  await step("idx be_principals name", `
    CREATE INDEX IF NOT EXISTS idx_be_principals_name
    ON be_principals ((upper(btrim(first_name)) || ' ' || upper(btrim(last_name))))`);

  await step("ANALYZE", "ANALYZE ucc_debtors; ANALYZE be_principals");
  log("ALL DONE ✅");
} catch (e) { log("ABORTED: " + e.message); } finally { await sql.end(); }