// Product features as SQL over the loaded data. Plain SQL -> portable to Supabase.
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
  first: string; last: string; companies: number; company_list: string;
};

// FEATURE 1 — competitor-funder poaching feed
export function competitorFeed(competitors: string[], ownName: string) {
  return q<Lead>(
    `WITH funder AS (
       SELECT ucc1_num, ucc3_num, org_name AS funder_name, normalize_name(org_name) AS funder_norm
       FROM ucc_secured_parties WHERE org_name <> ''
     ),
     merchant AS (
       SELECT ucc1_num, ucc3_num, org_name AS merchant_name, addr1, city, state, postal_code
       FROM ucc_debtors WHERE debtor_type = 'Organization' AND org_name <> ''
     )
     SELECT f.filing_date::date AS filed, m.merchant_name, fn.funder_name AS funded_by,
            m.city, m.state, m.postal_code
     FROM ucc_filings f
     JOIN funder fn  ON fn.ucc1_num = f.ucc1_num AND fn.ucc3_num = f.ucc3_num
     JOIN merchant m ON m.ucc1_num  = f.ucc1_num AND m.ucc3_num  = f.ucc3_num
     WHERE f.filing_type_id = 'UCC' AND f.action_type = 'Lien Financing Stmt'
       AND fn.funder_norm IN (SELECT normalize_name(w) FROM unnest($1::text[]) AS w)
       AND fn.funder_norm <> normalize_name($2)
     ORDER BY f.filing_date DESC`,
    [competitors, ownName],
  );
}

// FEATURE 2 — stacking detector (with junk/institution/trust filters)
export function stackingDetector(minFunders: number) {
  return q<StackedMerchant>(
    `WITH events AS (
       SELECT ucc1_num,
              bool_or(action_type = 'Termination') AS terminated,
              max(lapse_date) AS eff_lapse,
              bool_or(action_type = 'Lien Financing Stmt' AND filing_type_id = 'UCC') AS is_ucc_initial
       FROM ucc_filings GROUP BY ucc1_num
     ),
     amend_term AS (SELECT DISTINCT ucc1_num FROM ucc_amendments WHERE action_type = 'Termination'),
     active AS (
       SELECT e.ucc1_num FROM events e
       WHERE e.is_ucc_initial AND NOT e.terminated
         AND e.ucc1_num NOT IN (SELECT ucc1_num FROM amend_term)
         AND (e.eff_lapse IS NULL OR e.eff_lapse > now())
     ),
     lien AS (
       SELECT a.ucc1_num, normalize_name(d.org_name) AS merchant_norm,
              max(d.org_name) AS merchant_name, normalize_name(s.org_name) AS funder_norm
       FROM active a
       JOIN ucc_debtors d         ON d.ucc1_num = a.ucc1_num AND d.debtor_type = 'Organization' AND d.org_name <> ''
       JOIN ucc_secured_parties s ON s.ucc1_num = a.ucc1_num AND s.org_name <> ''
       WHERE NOT is_excluded(d.org_name) AND NOT is_excluded(s.org_name)
       GROUP BY a.ucc1_num, normalize_name(d.org_name), normalize_name(s.org_name)
     )
     SELECT max(merchant_name) AS merchant,
            count(DISTINCT funder_norm)::int AS distinct_funders,
            count(DISTINCT ucc1_num)::int    AS active_liens,
            string_agg(DISTINCT funder_norm, ', ') AS funders
     FROM lien GROUP BY merchant_norm
     HAVING count(DISTINCT funder_norm) >= $1
     ORDER BY distinct_funders DESC, active_liens DESC LIMIT 100`,
    [minFunders],
  );
}

// FEATURE 3a — company -> the people who run it
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

// FEATURE 3b — person -> every company they run
export function companiesOfPerson(personTerm: string, minCompanies = 1) {
  return q<PersonCompanies>(
    `SELECT initcap(lower(first_name)) AS first, initcap(lower(last_name)) AS last,
            count(DISTINCT entity_num)::int AS companies,
            string_agg(DISTINCT entity_name, '  |  ') AS company_list
     FROM be_principals
     WHERE last_name <> '' AND first_name <> ''
       AND (upper(first_name || ' ' || last_name) LIKE '%' || upper($1) || '%'
            OR upper(last_name) LIKE '%' || upper($1) || '%')
     GROUP BY upper(first_name), upper(last_name), initcap(lower(first_name)), initcap(lower(last_name))
     HAVING count(DISTINCT entity_num) >= $2
     ORDER BY companies DESC LIMIT 100`,
    [personTerm, minCompanies],
  );
}

// People who run multiple companies — the "owner empires" discovery list.
export function ownerEmpires(minCompanies = 2) {
  return q<PersonCompanies>(
    `SELECT initcap(lower(first_name)) AS first, initcap(lower(last_name)) AS last,
            count(DISTINCT entity_num)::int AS companies,
            string_agg(DISTINCT entity_name, '  |  ') AS company_list
     FROM be_principals
     WHERE last_name <> '' AND first_name <> ''
     GROUP BY upper(first_name), upper(last_name), initcap(lower(first_name)), initcap(lower(last_name))
     HAVING count(DISTINCT entity_num) >= $1
     ORDER BY companies DESC LIMIT 50`,
    [minCompanies],
  );
}

// Top funders present in the data (for the feed's pick-list), excluding junk.
export function topFunders(limit = 30) {
  return q<{ funder: string; filings: number }>(
    `SELECT org_name AS funder, count(*)::int AS filings
     FROM ucc_secured_parties sp
     JOIN ucc_filings f ON f.ucc1_num = sp.ucc1_num AND f.ucc3_num = sp.ucc3_num
     WHERE sp.org_name <> '' AND f.filing_type_id = 'UCC'
       AND f.action_type = 'Lien Financing Stmt' AND NOT is_excluded(sp.org_name)
     GROUP BY org_name ORDER BY filings DESC LIMIT $1`,
    [limit],
  );
}

export function stats() {
  return q<{ label: string; n: number }>(
    `SELECT 'UCC filings' AS label, count(*)::int AS n FROM ucc_filings
     UNION ALL SELECT 'Businesses (debtors)', count(DISTINCT normalize_name(org_name))::int FROM ucc_debtors WHERE debtor_type='Organization'
     UNION ALL SELECT 'Funders', count(DISTINCT normalize_name(org_name))::int FROM ucc_secured_parties WHERE org_name<>''
     UNION ALL SELECT 'CA companies on file', count(*)::int FROM be_entities
     UNION ALL SELECT 'Company principals', count(*)::int FROM be_principals`,
  );
}
