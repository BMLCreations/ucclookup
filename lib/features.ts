// Product features as SQL over the loaded data. Plain SQL -> portable.
// Heavy discovery features read PRECOMPUTED summary tables (built by
// scripts/precompute.mjs, refreshed on each data load) so pages are instant.
// Live lookups (feed by funder, name search) hit the raw tables but use indexes
// (functional normalize_name indexes + pg_trgm trigram indexes for LIKE '%x%').
import { q } from './db';

export type Lead = {
  filed: string; merchant_name: string; funded_by: string;
  city: string; state: string; postal_code: string;
};
export type StackedMerchant = {
  merchant: string; distinct_funders: number; active_liens: number; funders: string;
};
export type CompanyOwner = {
  entity_name: string; entity_type: string; first_name: string;
  last_name: string; position_type: string; city: string; state: string;
};
export type PersonCompanies = {
  first: string; last: string; city: string; state: string;
  companies: number; company_list: string;
};

// FEATURE 1 — competitor-funder poaching feed (reads denormalized sum_leads; instant).
export function competitorFeed(competitors: string[], ownName: string) {
  return q<Lead>(
    `SELECT filed, merchant_name, funder_name AS funded_by, city, state, postal_code
     FROM sum_leads
     WHERE funder_norm IN (SELECT normalize_name(w) FROM unnest($1::text[]) AS w)
       AND funder_norm <> normalize_name($2)
     ORDER BY filed DESC
     LIMIT 200`,
    [competitors, ownName],
  );
}

// FEATURE 2 — stacking detector (reads precomputed sum_stacked; instant).
export function stackingDetector(minFunders: number) {
  return q<StackedMerchant>(
    `SELECT merchant, distinct_funders, active_liens, funders
     FROM sum_stacked
     WHERE distinct_funders >= $1
     ORDER BY distinct_funders DESC, active_liens DESC
     LIMIT 100`,
    [minFunders],
  );
}

// FEATURE 3a — company -> the people who run it (LIVE; uses be_entities trigram index).
export function ownersOfCompany(companyTerm: string) {
  return q<CompanyOwner>(
    `SELECT e.entity_name, e.entity_type, p.first_name, p.last_name,
            p.position_type, p.city, p.state
     FROM be_entities e
     JOIN be_principals p ON p.entity_num = e.entity_num
     WHERE normalize_name(e.entity_name) LIKE '%' || normalize_name($1) || '%'
       AND p.last_name <> ''
     ORDER BY e.entity_name, p.last_name LIMIT 100`,
    [companyTerm],
  );
}

// FEATURE 3b — person -> every company they run (reads RESOLVED people: er_persons).
// Each row is one real person (name + city/state), disambiguated by address — so a
// search for "John Smith" returns the many distinct John Smiths, not one fake blob.
export function companiesOfPerson(personTerm: string, minCompanies = 1) {
  return q<PersonCompanies>(
    `SELECT first, last, city, state, companies, company_list
     FROM er_persons
     WHERE upper(coalesce(first,'') || ' ' || coalesce(last,'')) LIKE '%' || upper($1) || '%'
       AND companies >= $2 AND NOT professional
     ORDER BY companies DESC LIMIT 100`,
    [personTerm, minCompanies],
  );
}

// People who run multiple companies — "owner empires" (RESOLVED people: er_persons).
export function ownerEmpires(minCompanies = 2) {
  return q<PersonCompanies>(
    `SELECT first, last, city, state, companies, company_list
     FROM er_persons
     WHERE companies >= $1 AND NOT professional
     ORDER BY companies DESC LIMIT 50`,
    [minCompanies],
  );
}

// Top funders for the feed's pick-list (reads precomputed sum_funders).
export function topFunders(limit = 30) {
  return q<{ funder: string; filings: number }>(
    `SELECT funder, filings FROM sum_funders ORDER BY filings DESC LIMIT $1`,
    [limit],
  );
}

export function stats() {
  return q<{ label: string; n: number }>(
    `SELECT label, n::int AS n FROM sum_stats
     ORDER BY array_position(
       ARRAY['UCC filings','Businesses (debtors)','Funders','CA companies on file','Company principals'],
       label)`,
  );
}

// ── Unified search (Phase 2) ───────────────────────────────────────────────
export type BusinessRow = {
  biz_norm: string; biz_name: string; city: string; state: string;
  ucc_count: number; ucc_6mo: number; ucc_12mo: number;
  last_filing: string; distinct_funders: number;
};

export type SearchWindow = "all" | "3mo" | "6mo" | "12mo";
const WINDOW_COL: Record<SearchWindow, string> = {
  all: "ucc_count", "3mo": "ucc_3mo", "6mo": "ucc_6mo", "12mo": "ucc_12mo",
};

// Unified business search: name (company/debtor) + funder (secured party) +
// minimum # of UCC filings within a date window. Filters AND together.
export function searchBusinesses(opts: {
  name?: string; funder?: string; minFilings?: number; window?: SearchWindow;
}) {
  const name = (opts.name ?? "").trim();
  const funder = (opts.funder ?? "").trim();
  const minFilings = Math.max(1, Number(opts.minFilings) || 1);
  const col = WINDOW_COL[opts.window ?? "all"] ?? "ucc_count"; // whitelisted, safe to interpolate
  return q<BusinessRow>(
    `SELECT biz_norm, biz_name, city, state, ucc_count, ucc_6mo, ucc_12mo,
            last_filing::text AS last_filing, distinct_funders
     FROM prof_business
     WHERE ${col} >= $1
       AND ($2 = '' OR biz_name ILIKE '%' || $2 || '%')
       AND ($3 = '' OR biz_norm IN (
             SELECT normalize_name(merchant_name) FROM sum_leads
             WHERE funder_norm = normalize_name($3)))
     ORDER BY ${col} DESC, ucc_count DESC
     LIMIT 200`,
    [minFilings, name, funder],
  );
}

// ── Company profile (Phase 3) ──────────────────────────────────────────────
export function businessHeadline(bizNorm: string) {
  return q<BusinessRow>(
    `SELECT biz_norm, biz_name, city, state, ucc_count, ucc_6mo, ucc_12mo,
            last_filing::text AS last_filing, distinct_funders
     FROM prof_business WHERE biz_norm = $1 LIMIT 1`,
    [bizNorm],
  );
}
export type BizFiling = { filed: string; action: string; funder: string; lapse: string };
export function businessFilings(bizNorm: string) {
  return q<BizFiling>(
    `SELECT f.filing_date::text AS filed, f.action_type AS action,
            coalesce(sp.org_name, '') AS funder, f.lapse_date::text AS lapse
     FROM ucc_debtors d
     JOIN ucc_filings f ON f.ucc1_num = d.ucc1_num AND f.ucc3_num = d.ucc3_num
     LEFT JOIN ucc_secured_parties sp ON sp.ucc1_num = d.ucc1_num AND sp.ucc3_num = d.ucc3_num AND sp.org_name <> ''
     WHERE d.debtor_type = 'Organization' AND normalize_name(d.org_name) = $1 AND f.filing_type_id = 'UCC'
     ORDER BY f.filing_date DESC LIMIT 300`,
    [bizNorm],
  );
}
export type BizPrincipal = { name: string; role: string; entity_name: string };
export function businessPrincipals(bizNorm: string) {
  return q<BizPrincipal>(
    `SELECT DISTINCT initcap(lower(p.first_name || ' ' || p.last_name)) AS name,
            p.position_type AS role, e.entity_name
     FROM be_entities e
     JOIN be_principals p ON p.entity_num = e.entity_num
     WHERE normalize_name(e.entity_name) = $1 AND p.last_name <> ''
     ORDER BY e.entity_name, name LIMIT 100`,
    [bizNorm],
  );
}
