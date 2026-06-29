// Classify secured parties (funders) as MCA (merchant cash advance) shops, so the
// app can show "MCA exposure" / "stacked with N MCA shops". No collateral text
// needed — three signals, all on data we already have:
//   (1) SEED      — curated list of known MCA funders (ground truth)
//   (3) BEHAVIOR  — re-up ratio + how stacked their merchants are
//   (4) CO-OCCUR  — share of a funder's merchants also funded by a known MCA shop
//                   (MCA funders travel together on stacked merchants)
// Output: table funder_mca (one row per funder) with is_mca + tier + score.
// Idempotent. Run after each data load (depends on sum_leads + prof_business).
import postgres from "postgres";
const URL = process.env.LOAD_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("Set DATABASE_URL"); process.exit(1); }
const sql = postgres(URL, { prepare: false, ssl: "require", max: 1, connect_timeout: 30, idle_timeout: 0 });
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
const step = async (n, q) => { const s = Date.now(); log("START " + n); try { await sql.unsafe(q); log(`DONE  ${n} in ${((Date.now() - s) / 1000).toFixed(1)}s`); } catch (e) { log(`FAIL  ${n}: ${e.message}`); throw e; } };

// Seed = known MCA funders (real data spellings) + strong MCA name-indicators.
// Broad LIKE patterns to catch entity-name variants/subsidiaries/DBAs.
const SEED_LIKE = [
  // named funders (as they actually appear in the data)
  "%ON DECK%", "%ONDECK%", "%FORWARD FINANC%", "%KAPITUS%", "%STRATEGIC FUNDING%",
  "%RAPIDADVANCE%", "%RAPID ADVANCE%", "%FORA FINANCIAL%", "%CREDIBLY%", "%RETAIL CAPITAL%",
  "%EVEREST BUSINESS%", "%MANTIS FUNDING%", "%FUNDKITE%", "%PEARL CAPITAL%", "%PEARL BETA%",
  "%YELLOWSTONE CAPITAL%", "%FUNDRY%", "%NATIONAL FUNDING%", "%CAN CAPITAL%", "%RELIANT FUNDING%",
  "%LENDINI%", "%CARDINAL EQUITY%", "%ELEVATE FUNDING%", "%IDEA FINANCIAL%", "%TORRO MARKETPLACE%",
  "%VADER MOUNTAIN%", "%BITTY ADVANCE%", "%EXPANSION CAPITAL%", "%LIBERTAS FUNDING%",
  "%HEADWAY CAPITAL%", "%MULLIGAN FUNDING%", "%IOU FINANCIAL%", "%IOU CENTRAL%", "%KNIGHT CAPITAL FUNDING%",
  "%CRESTHILL%", "%WIDE MERCHANT%", "%CAPITAL STACK%", "%SLATE ADVANCE%", "%FOX BUSINESS FUNDING%",
  "%KALAMATA%", "%VELOCITY CAPITAL GROUP%", "%ROC FUNDING%", "%SPLASH ADVANCE%", "%LEGEND FUNDING%",
  "%LEGEND ADVANCE%", "%UNIQUE FUNDING SOLUTIONS%", "%NEWCO CAPITAL%", "%BYZFUNDER%", "%DELTA BRIDGE FUNDING%",
  "%UNITED CAPITAL SOURCE%", "%GREENBOX CAPITAL%", "%SOS CAPITAL%", "%LCF GROUP%", "%BFS CAPITAL%",
  "%FENIX CAPITAL FUNDING%", "%PRINCIPIS CAPITAL%", "%THE FUNDWORKS%", "%WYNWOOD CAPITAL%",
  "%GREEN CAPITAL FUNDING%", "%ADVANCE FUNDS NETWORK%", "%COMPLETE BUSINESS SOLUTIONS%", "%PAR FUNDING%",
  "%GLOBAL MERCHANT CASH%", "%WORLD BUSINESS LENDERS%", "%PLATINUM RAPID FUNDING%", "%QUEEN FUNDING%",
  "%CFG MERCHANT%", "%PIRS CAPITAL%", "%RICHMOND CAPITAL%", "%FUNDING METRICS%", "%LENDR%",
  "%SAMSON MCA%", "%NEXI CAPITAL%", "%FUNDFI%", "%SPG ADVANCE%", "%CLOUDFUND%", "%CFG MERCHANT SOLUTIONS%",
  // strong MCA name-indicators (rarely non-MCA)
  "%MERCHANT CASH%", "%CASH ADVANCE%", "%MERCHANT FUNDING%", "%MERCHANT CAPITAL%",
  "%MERCHANT ADVANCE%", "%BUSINESS ADVANCE%", "%CAPITAL ADVANCE%", "%FUTURE RECEIVABLES%",
];
// Negative guard — NOT MCA: filing agents (mask the real funder), banks, equipment captives,
// PE/LP funds, leasing, REITs, SBA. Excluded from MCA tagging regardless of overlap.
const EXCL = '(CORPORATION SERVICE|\\mC T CORP|FIRST CORPORATE SOLUTIONS|\\mCHTD\\M|\\mCSC\\M|REPRESENTATIVE|AS AGENT|\\mBANK\\M|CREDIT UNION|EQUIPMENT FINANC|\\mLEASING\\M|VENDOR FINANC|CAPITAL PARTNERS|OFFSHORE|\\mL P\\M|PROPERTIES|REALTY|\\mREIT\\M|SMALL BUSINESS ADMIN|\\mDEERE\\M|KOMATSU|CATERPILLAR|KUBOTA|\\mVFS\\M|PACCAR|TOYOTA|NAVISTAR|HITACHI|DOOSAN|GENERAL ELECTRIC|GENERAL MOTORS|FARM CREDIT|DE LAGE|TRANSAMERICA|CIT GROUP|NEXTGEAR|AUTOMOTIVE FINANCE|US BANCORP|ACCEPTANCE)';
// Name gate — MCA-indicative tokens. A non-excluded funder with moderate co-occurrence
// (overlap >= 0.25) AND one of these in its name is almost certainly an MCA shop, even
// if it wasn't on the seed list. Bank/equipment/agent/PE names are already EXCL'd out.
const NAMEGATE = '(FUNDING|FUNDER|\\mFUND\\M|\\mADVANCE|\\mCASH\\M|RECEIVABLES|MERCHANT|\\mMCA\\M|FINANCING|\\mLENDING|\\mCAPITAL\\M|\\mFINANCE\\M)';

try {
  await sql.unsafe("SET statement_timeout=0; SET work_mem='256MB'; SET max_parallel_workers_per_gather=4");
  await sql.unsafe("DROP TABLE IF EXISTS funder_mca, mca_fm, mca_seedm");

  // base: one row per funder with filing/merchant counts
  await step("base funder_mca", `
    CREATE TABLE funder_mca AS
      SELECT funder_norm, max(funder_name) AS funder_name,
             count(*)::int AS leads,
             count(DISTINCT juris || ':' || normalize_name(merchant_name))::int AS merchants
      FROM sum_leads WHERE funder_norm IS NOT NULL
      GROUP BY funder_norm;
    ALTER TABLE funder_mca
      ADD COLUMN seed bool NOT NULL DEFAULT false,
      ADD COLUMN excluded bool NOT NULL DEFAULT false,
      ADD COLUMN stacked int NOT NULL DEFAULT 0,
      ADD COLUMN overlap int NOT NULL DEFAULT 0,
      ADD COLUMN reup numeric, ADD COLUMN stacked_share numeric, ADD COLUMN mca_overlap numeric,
      ADD COLUMN mca_score numeric, ADD COLUMN is_mca bool NOT NULL DEFAULT false, ADD COLUMN tier text;
    CREATE INDEX ON funder_mca (funder_norm)`);

  // negative guard — filing agents / banks / equipment / PE-LP / REIT / SBA are NOT MCA
  await step("exclude non-MCA", `UPDATE funder_mca SET excluded = (funder_norm ~ '${EXCL}')`);

  // distinct funder<->merchant edges (reused twice)
  await step("edges mca_fm", `
    CREATE UNLOGGED TABLE mca_fm AS
      SELECT DISTINCT funder_norm, juris || ':' || normalize_name(merchant_name) AS biz_norm
      FROM sum_leads WHERE funder_norm IS NOT NULL AND normalize_name(merchant_name) IS NOT NULL;
    CREATE INDEX ON mca_fm (biz_norm);
    CREATE INDEX ON mca_fm (funder_norm)`);

  // (1) SEED — broad LIKE match on known funders + MCA name-indicators (skip excluded)
  { const s = Date.now(); log("START tag seeds");
    const r = await sql`UPDATE funder_mca SET seed = true
      WHERE NOT excluded AND funder_norm LIKE ANY (${SEED_LIKE}::text[])`;
    log(`DONE  tag seeds (${r.count} funders) in ${((Date.now() - s) / 1000).toFixed(1)}s`); }

  // merchants touched by ANY seed MCA funder
  await step("seed merchants", `
    CREATE UNLOGGED TABLE mca_seedm AS
      SELECT DISTINCT fm.biz_norm FROM mca_fm fm JOIN funder_mca f ON f.funder_norm = fm.funder_norm WHERE f.seed;
    CREATE INDEX ON mca_seedm (biz_norm)`);

  // (4) CO-OCCUR — per funder, how many of its merchants are also seed-MCA merchants
  await step("co-occurrence overlap", `
    UPDATE funder_mca f SET overlap = s.n FROM (
      SELECT fm.funder_norm, count(*) FILTER (WHERE sm.biz_norm IS NOT NULL)::int n
      FROM mca_fm fm LEFT JOIN mca_seedm sm ON sm.biz_norm = fm.biz_norm
      GROUP BY fm.funder_norm
    ) s WHERE s.funder_norm = f.funder_norm`);

  // (3) BEHAVIOR — how many of a funder's merchants are stacked (>=2 funders)
  await step("stacked share", `
    UPDATE funder_mca f SET stacked = s.n FROM (
      SELECT fm.funder_norm, count(*) FILTER (WHERE b.distinct_funders >= 2)::int n
      FROM mca_fm fm JOIN prof_business b ON b.biz_norm = fm.biz_norm
      GROUP BY fm.funder_norm
    ) s WHERE s.funder_norm = f.funder_norm`);

  // ratios + classification. Co-occurrence (mca_overlap) is the gate for non-seed;
  // 'candidate' = high-overlap discoveries to review/promote (NOT auto-tagged MCA).
  await step("score + classify", `
    UPDATE funder_mca SET
      reup = round(leads::numeric / nullif(merchants,0), 2),
      stacked_share = round(stacked::numeric / nullif(merchants,0), 3),
      mca_overlap = round(overlap::numeric / nullif(merchants,0), 3);
    UPDATE funder_mca SET mca_score = coalesce(mca_overlap,0);
    UPDATE funder_mca SET
      is_mca = seed
            OR (NOT excluded AND merchants >= 20 AND mca_overlap >= 0.40)
            OR (NOT excluded AND merchants >= 10 AND mca_overlap >= 0.25 AND funder_norm ~ '${NAMEGATE}'),
      tier = CASE
        WHEN seed THEN 'seed'
        WHEN excluded THEN 'no'
        WHEN merchants >= 20 AND mca_overlap >= 0.50 THEN 'strong'
        WHEN merchants >= 20 AND mca_overlap >= 0.40 THEN 'likely'
        WHEN merchants >= 10 AND mca_overlap >= 0.25 AND funder_norm ~ '${NAMEGATE}' THEN 'named'
        WHEN merchants >= 10 AND mca_overlap >= 0.25 THEN 'candidate'
        ELSE 'no' END;
    CREATE INDEX ON funder_mca (is_mca);
    CREATE INDEX ON funder_mca (funder_norm, is_mca)`);

  await sql.unsafe("DROP TABLE IF EXISTS mca_fm, mca_seedm");
  await step("ANALYZE", "ANALYZE funder_mca");

  // ── report ──
  const t = await sql`SELECT tier, count(*)::int n, sum(leads)::bigint filings FROM funder_mca GROUP BY tier ORDER BY 3 DESC NULLS LAST`;
  log("by tier:"); for (const r of t) log(`  ${(r.tier||'no').padEnd(8)} ${r.n.toLocaleString().padStart(8)} funders · ${Number(r.filings).toLocaleString()} filings`);
  const mc = await sql`SELECT count(*) FILTER (WHERE is_mca)::int n, sum(leads) FILTER (WHERE is_mca)::bigint f FROM funder_mca`;
  log(`MCA funders: ${mc[0].n.toLocaleString()} (${Number(mc[0].f).toLocaleString()} filings)`);
  const disc = await sql`SELECT funder_name, leads, merchants, mca_overlap, stacked_share, mca_score FROM funder_mca WHERE is_mca AND NOT seed ORDER BY leads DESC LIMIT 12`;
  log("top co-occurrence DISCOVERED MCA funders (not on seed list):");
  for (const r of disc) log(`  ${(r.funder_name||'').slice(0,34).padEnd(34)} ${String(r.leads).padStart(7)} liens · overlap ${r.mca_overlap} stacked ${r.stacked_share} score ${r.mca_score}`);
  const banks = await sql`SELECT funder_name, leads, mca_overlap, mca_score, is_mca FROM funder_mca
     WHERE funder_norm ~ '(BANK|CREDIT UNION|LEASING|EQUIPMENT FINANCE|FORD|TOYOTA|JOHN DEERE|WELLS FARGO|JPMORGAN|DE LAGE|US BANCORP)' ORDER BY leads DESC LIMIT 8`;
  log("sanity — these should mostly be is_mca=false:");
  for (const r of banks) log(`  ${(r.funder_name||'').slice(0,34).padEnd(34)} ${String(r.leads).padStart(7)} · score ${r.mca_score} · is_mca=${r.is_mca}`);
  const cand = await sql`SELECT funder_name, leads, merchants, mca_overlap FROM funder_mca WHERE tier='candidate' ORDER BY leads DESC LIMIT 20`;
  log("candidate review queue (overlap 0.25–0.40 — eyeball, promote real MCA to seed):");
  for (const r of cand) log(`  ${(r.funder_name||'').slice(0,40).padEnd(40)} ${String(r.leads).padStart(7)} liens · ${r.merchants} merch · overlap ${r.mca_overlap}`);
  log("ALL DONE ✅");
} catch (e) { log("ABORTED: " + (e.stack || e.message)); process.exitCode = 1; } finally { await sql.end(); }
