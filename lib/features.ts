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
