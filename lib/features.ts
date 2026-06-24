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
  active_liens: number; tax_liens: number; next_expiry: string | null;
};

export type SearchWindow = "all" | "3mo" | "6mo" | "12mo";
const WINDOW_COL: Record<SearchWindow, string> = {
  all: "ucc_count", "3mo": "ucc_3mo", "6mo": "ucc_6mo", "12mo": "ucc_12mo",
};

// Unified business search: name (company/debtor) + funder (secured party) +
// minimum # of UCC filings within a date window + geography. Filters AND together.
// Used by UCC Search (name-led lookup) and Lead Gen (filter-led discovery, no name/funder).
export function searchBusinesses(opts: {
  name?: string; funder?: string; minFilings?: number; minFunders?: number;
  window?: SearchWindow; state?: string; city?: string; renewingDays?: number;
}) {
  const name = (opts.name ?? "").trim();
  const funder = (opts.funder ?? "").trim();
  const state = (opts.state ?? "").trim();
  const city = (opts.city ?? "").trim();
  const minFilings = Math.max(1, Number(opts.minFilings) || 1);
  const minFunders = Math.max(0, Number(opts.minFunders) || 0); // stacking signal (distinct funders)
  const renewingDays = Math.max(0, Number(opts.renewingDays) || 0); // renewal radar window
  const col = WINDOW_COL[opts.window ?? "all"] ?? "ucc_count"; // whitelisted, safe to interpolate
  return q<BusinessRow>(
    `SELECT biz_norm, biz_name, city, state, ucc_count, ucc_6mo, ucc_12mo,
            last_filing::text AS last_filing, distinct_funders, active_liens, tax_liens,
            next_expiry::text AS next_expiry
     FROM prof_business
     WHERE ${col} >= $1
       AND distinct_funders >= $4
       AND ($2 = '' OR biz_name ILIKE '%' || $2 || '%')
       AND ($3 = '' OR biz_norm IN (
             SELECT normalize_name(merchant_name) FROM sum_leads
             WHERE funder_norm = normalize_name($3)))
       AND ($5 = '' OR upper(state) = upper($5))
       AND ($6 = '' OR city ILIKE '%' || $6 || '%')
       AND ($7 = 0 OR (next_expiry IS NOT NULL AND next_expiry >= current_date
             AND next_expiry <= current_date + ($7 * interval '1 day')))
     ORDER BY ${renewingDays > 0 ? "next_expiry ASC" : `${col} DESC, distinct_funders DESC`}
     LIMIT 200`,
    [minFilings, name, funder, minFunders, state, city, renewingDays],
  );
}

export type IndividualRow = {
  person_key: string; person_name: string; city: string; state: string;
  ucc_count: number; ucc_6mo: number; ucc_12mo: number;
  last_filing: string; distinct_funders: number;
  active_liens: number; tax_liens: number; next_expiry: string | null;
};

// Unified individual search: people who are UCC debtors/guarantors, by name +
// minimum # of their OWN UCC filings within a date window + geography. Filters AND.
// Used by UCC Search (name-led lookup) and Lead Gen (filter-led discovery, no name).
export function searchIndividuals(opts: {
  name?: string; minFilings?: number; minFunders?: number;
  window?: SearchWindow; state?: string; city?: string; renewingDays?: number;
}) {
  const name = (opts.name ?? "").trim();
  const state = (opts.state ?? "").trim();
  const city = (opts.city ?? "").trim();
  const minFilings = Math.max(1, Number(opts.minFilings) || 1);
  const minFunders = Math.max(0, Number(opts.minFunders) || 0);
  const renewingDays = Math.max(0, Number(opts.renewingDays) || 0);
  const col = WINDOW_COL[opts.window ?? "all"] ?? "ucc_count";
  return q<IndividualRow>(
    `SELECT person_key, person_name, city, state, ucc_count, ucc_6mo, ucc_12mo,
            last_filing::text AS last_filing, distinct_funders, active_liens, tax_liens,
            next_expiry::text AS next_expiry
     FROM prof_individual
     WHERE ${col} >= $1 AND distinct_funders >= $3
       AND ($2 = '' OR person_name ILIKE '%' || $2 || '%')
       AND ($4 = '' OR upper(state) = upper($4))
       AND ($5 = '' OR city ILIKE '%' || $5 || '%')
       AND ($6 = 0 OR (next_expiry IS NOT NULL AND next_expiry >= current_date
             AND next_expiry <= current_date + ($6 * interval '1 day')))
     ORDER BY ${renewingDays > 0 ? "next_expiry ASC" : `${col} DESC, distinct_funders DESC`}
     LIMIT 200`,
    [minFilings, name, minFunders, state, city, renewingDays],
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

// CA business-registry facts for a company. A normalized name can map to several
// registered entities; pick the best (prefer Active, then most recently active).
export type BizRegistry = { entity_name: string; entity_status: string; entity_type: string; agent: string | null };
export function businessRegistry(bizNorm: string) {
  return q<BizRegistry>(
    `SELECT e.entity_name, e.entity_status, e.entity_type,
            coalesce(nullif(btrim(a.org_name),''), nullif(btrim(a.first_name||' '||a.last_name),'')) AS agent
     FROM be_entities e
     LEFT JOIN be_agents a ON a.entity_num = e.entity_num
     WHERE normalize_name(e.entity_name) = $1
     ORDER BY (e.entity_status='Active') DESC, e.last_si_file_date DESC NULLS LAST
     LIMIT 1`,
    [bizNorm],
  );
}

// The distinct funders (secured parties) on a merchant's UCC liens, with how many
// liens each and the most recent. funder_norm lets us link to a funder profile.
export type FunderBrief = { funder: string; funder_norm: string; liens: number; last_filing: string };
export function businessFundersList(bizNorm: string) {
  return q<FunderBrief>(
    `SELECT coalesce(sp.org_name,'') AS funder, normalize_name(sp.org_name) AS funder_norm,
            count(DISTINCT f.ucc1_num)::int AS liens, max(f.filing_date)::date::text AS last_filing
     FROM ucc_debtors d
     JOIN ucc_filings f ON f.ucc1_num = d.ucc1_num AND f.ucc3_num = d.ucc3_num
          AND f.filing_type_id='UCC' AND f.action_type='Lien Financing Stmt'
     JOIN ucc_secured_parties sp ON sp.ucc1_num = f.ucc1_num AND sp.ucc3_num = f.ucc3_num AND sp.org_name <> ''
     WHERE d.debtor_type='Organization' AND normalize_name(d.org_name) = $1
     GROUP BY 1, 2 ORDER BY liens DESC, last_filing DESC LIMIT 50`,
    [bizNorm],
  );
}

// Yearly count of a merchant's new UCC liens — drives the funding-activity bars.
export type TimelinePoint = { period: string; n: number };
export function businessTimeline(bizNorm: string) {
  return q<TimelinePoint>(
    `SELECT to_char(date_trunc('year', f.filing_date),'YYYY') AS period, count(DISTINCT f.ucc1_num)::int AS n
     FROM ucc_debtors d
     JOIN ucc_filings f ON f.ucc1_num = d.ucc1_num AND f.ucc3_num = d.ucc3_num
          AND f.filing_type_id='UCC' AND f.action_type='Lien Financing Stmt'
     WHERE d.debtor_type='Organization' AND normalize_name(d.org_name) = $1
     GROUP BY 1 ORDER BY 1`,
    [bizNorm],
  );
}
export type BizFiling = {
  filed: string; funder: string; funder_norm: string; funder_loc: string | null;
  status: string; lapse: string; debtor_addr: string | null; filing_num: string;
};

// Enriched lien row, DEDUPED to one row per filing (a debtor is often listed
// several times on one filing with address-spelling variants). Per row: the
// funder (first secured party) + its location, the lien's live status across its
// whole lifecycle by ucc1_num (Terminated > Lapsed-by-date > Active), the
// continued lapse date, the debtor address on that filing, and the filing number.
function filingSql(where: string): string {
  return `
    SELECT filed, funder, funder_norm, funder_loc, debtor_addr, filing_num, status, lapse FROM (
      SELECT DISTINCT ON (f.ucc1_num)
        f.filing_date AS fd,
        f.filing_date::date::text AS filed,
        coalesce(sp.org_name, '') AS funder,
        coalesce(normalize_name(sp.org_name), '') AS funder_norm,
        nullif(btrim(coalesce(nullif(sp.city,''),'') ||
          CASE WHEN nullif(sp.state,'') IS NOT NULL THEN ', ' || sp.state ELSE '' END), ',') AS funder_loc,
        nullif(btrim(coalesce(nullif(d.addr1,''),'') ||
          CASE WHEN nullif(d.city,'') IS NOT NULL THEN ', ' || d.city ELSE '' END), ',') AS debtor_addr,
        f.ucc1_num AS filing_num,
        CASE WHEN life.terminated THEN 'Terminated'
             WHEN coalesce(life.max_lapse, f.lapse_date) < now() THEN 'Lapsed'
             ELSE 'Active' END AS status,
        coalesce(life.max_lapse, f.lapse_date)::date::text AS lapse
      FROM ucc_debtors d
      JOIN ucc_filings f ON f.ucc1_num = d.ucc1_num AND f.ucc3_num = d.ucc3_num
      LEFT JOIN LATERAL (
        SELECT s.org_name, s.city, s.state FROM ucc_secured_parties s
        WHERE s.ucc1_num = f.ucc1_num AND s.ucc3_num = f.ucc3_num AND s.org_name <> ''
        ORDER BY s.org_name LIMIT 1
      ) sp ON true
      LEFT JOIN LATERAL (
        SELECT bool_or(a.action_type = 'Termination') AS terminated, max(a.lapse_date) AS max_lapse
        FROM ucc_filings a WHERE a.ucc1_num = f.ucc1_num AND a.filing_type_id = 'UCC'
      ) life ON true
      WHERE ${where} AND f.action_type = 'Lien Financing Stmt'
      ORDER BY f.ucc1_num
    ) x ORDER BY fd DESC LIMIT 300`;
}

export function businessFilings(bizNorm: string) {
  return q<BizFiling>(
    filingSql(`d.debtor_type = 'Organization' AND normalize_name(d.org_name) = $1 AND f.filing_type_id = 'UCC'`),
    [bizNorm],
  );
}

// Tax liens (state + federal) and judgment liens against a debtor — separate
// filing types we load but don't show in the UCC history. A distress signal.
export type LienRow = { filed: string; lien_type: string; claimant: string; status: string };
function lienSql(where: string): string {
  return `
    SELECT filed, lien_type, claimant, status FROM (
      SELECT DISTINCT ON (f.ucc1_num)
        f.filing_date AS fd,
        f.filing_date::date::text AS filed,
        CASE f.filing_type_id
          WHEN 'Notice of State Tax Lien'   THEN 'State tax lien'
          WHEN 'Notice of Federal Tax Lien' THEN 'Federal tax lien'
          WHEN 'Judgment Lien'              THEN 'Judgment'
          ELSE f.filing_type_id END AS lien_type,
        coalesce(sp.org_name, '') AS claimant,
        CASE WHEN life.terminated THEN 'Terminated'
             WHEN coalesce(life.max_lapse, f.lapse_date) IS NOT NULL
                  AND coalesce(life.max_lapse, f.lapse_date) < now() THEN 'Lapsed'
             ELSE 'Active' END AS status
      FROM ucc_debtors d
      JOIN ucc_filings f ON f.ucc1_num = d.ucc1_num AND f.ucc3_num = d.ucc3_num
      LEFT JOIN LATERAL (
        SELECT s.org_name FROM ucc_secured_parties s
        WHERE s.ucc1_num = f.ucc1_num AND s.ucc3_num = f.ucc3_num AND s.org_name <> ''
        ORDER BY s.org_name LIMIT 1
      ) sp ON true
      LEFT JOIN LATERAL (
        SELECT bool_or(a.action_type = 'Termination') AS terminated, max(a.lapse_date) AS max_lapse
        FROM ucc_filings a WHERE a.ucc1_num = f.ucc1_num AND a.filing_type_id = f.filing_type_id
      ) life ON true
      WHERE ${where}
        AND f.filing_type_id IN ('Notice of State Tax Lien','Notice of Federal Tax Lien','Judgment Lien')
        AND f.action_type = 'Lien Financing Stmt'
      ORDER BY f.ucc1_num
    ) x ORDER BY fd DESC LIMIT 100`;
}

export function businessLiens(bizNorm: string) {
  return q<LienRow>(lienSql(`d.debtor_type = 'Organization' AND normalize_name(d.org_name) = $1`), [bizNorm]);
}
// ── 1-hop network (Phase 4) ────────────────────────────────────────────────
// Other UCC-active companies that share an owner with this one (this company ->
// its registry principals -> their OTHER companies). Nominees/registered agents
// (a principal on > 25 companies) are dropped so the network doesn't explode with
// false links, and results are joined to prof_business so every link is live and
// the related company's own lien signals come along.
export type RelatedCompany = {
  biz_norm: string; biz_name: string; via: string;
  ucc_count: number; active_liens: number; tax_liens: number;
};
export function relatedCompanies(bizNorm: string) {
  return q<RelatedCompany>(
    `WITH my_principals AS (
       SELECT DISTINCT upper(btrim(p.first_name))||' '||upper(btrim(p.last_name)) AS pname,
              nullif(upper(btrim(p.city)),'') AS pcity
       FROM be_entities e JOIN be_principals p ON p.entity_num = e.entity_num
       WHERE normalize_name(e.entity_name) = $1 AND p.last_name <> ''
     ),
     owners AS (  -- drop nominees: a principal listed on > 25 companies is an agent
       SELECT pname, pcity FROM my_principals mp
       WHERE (SELECT count(*) FROM be_principals bp
              WHERE upper(btrim(bp.first_name))||' '||upper(btrim(bp.last_name)) = mp.pname) <= 25
     ),
     related AS (
       SELECT DISTINCT normalize_name(e2.entity_name) AS biz_norm, o.pname
       FROM owners o
       JOIN be_principals p2 ON upper(btrim(p2.first_name))||' '||upper(btrim(p2.last_name)) = o.pname
            AND (o.pcity IS NULL OR upper(btrim(p2.city)) = o.pcity)
       JOIN be_entities e2 ON e2.entity_num = p2.entity_num
       WHERE normalize_name(e2.entity_name) <> $1
     )
     SELECT r.biz_norm, max(b.biz_name) AS biz_name,
            string_agg(DISTINCT initcap(lower(r.pname)), ', ') AS via,
            max(b.ucc_count) AS ucc_count, max(b.active_liens) AS active_liens, max(b.tax_liens) AS tax_liens
     FROM related r JOIN prof_business b ON b.biz_norm = r.biz_norm
     GROUP BY r.biz_norm
     ORDER BY max(b.ucc_count) DESC LIMIT 50`,
    [bizNorm],
  );
}

export type BizPrincipal = { name: string; role: string; entity_name: string; person_key: string; has_profile: boolean };
// person_key + has_profile let the UI link a principal to their person profile,
// but only when they actually appear as a UCC individual debtor (else plain text).
const PRINCIPAL_KEY = `upper(btrim(p.first_name))||' '||upper(btrim(p.last_name))||'|'||
  coalesce(nullif(upper(btrim(p.city)),''),'')||'|'||coalesce(nullif(upper(btrim(p.state)),''),'')`;
export function businessPrincipals(bizNorm: string) {
  return q<BizPrincipal>(
    `SELECT DISTINCT initcap(lower(p.first_name || ' ' || p.last_name)) AS name,
            p.position_type AS role, e.entity_name,
            ${PRINCIPAL_KEY} AS person_key,
            (pi.person_key IS NOT NULL) AS has_profile
     FROM be_entities e
     JOIN be_principals p ON p.entity_num = e.entity_num
     LEFT JOIN prof_individual pi ON pi.person_key = ${PRINCIPAL_KEY}
     WHERE normalize_name(e.entity_name) = $1 AND p.last_name <> ''
     ORDER BY e.entity_name, name LIMIT 100`,
    [bizNorm],
  );
}

// ── Funder profile ─────────────────────────────────────────────────────────
// A secured party's whole book, from the denormalized sum_leads table.
export type FunderHeadline = { funder_name: string; total: number; merchants: number; last_filing: string };
export function funderHeadline(funderNorm: string) {
  return q<FunderHeadline>(
    `SELECT max(funder_name) AS funder_name, count(*)::int AS total,
            count(DISTINCT normalize_name(merchant_name))::int AS merchants,
            max(filed)::date::text AS last_filing
     FROM sum_leads WHERE funder_norm = $1`,
    [funderNorm],
  );
}
export type FunderMerchant = { merchant: string; biz_norm: string; liens: number; last_filing: string; city: string; state: string };
export function funderMerchants(funderNorm: string) {
  return q<FunderMerchant>(
    `SELECT max(merchant_name) AS merchant, normalize_name(merchant_name) AS biz_norm,
            count(*)::int AS liens, max(filed)::date::text AS last_filing,
            (array_agg(nullif(city,'') ORDER BY filed DESC) FILTER (WHERE city <> ''))[1] AS city,
            (array_agg(nullif(state,'') ORDER BY filed DESC) FILTER (WHERE state <> ''))[1] AS state
     FROM sum_leads WHERE funder_norm = $1
     GROUP BY normalize_name(merchant_name)
     ORDER BY liens DESC, last_filing DESC LIMIT 200`,
    [funderNorm],
  );
}

// ── Individual / person profile (Phase 3b) ─────────────────────────────────
// A person is identified by prof_individual.person_key = NAME_NORM|CITY|STATE
// (uppercased; CITY/STATE empty-string when unknown). All three lookups below
// split that key so they target the same name + place consistently.
export function personHeadline(personKey: string) {
  return q<IndividualRow>(
    `SELECT person_key, person_name, city, state, ucc_count, ucc_6mo, ucc_12mo,
            last_filing::text AS last_filing, distinct_funders
     FROM prof_individual WHERE person_key = $1 LIMIT 1`,
    [personKey],
  );
}

// Every UCC filing where this individual is the debtor/guarantor.
const PERSON_MATCH = `
  upper(btrim(d.first_name)) || ' ' || upper(btrim(d.last_name)) = $1
  AND coalesce(nullif(upper(btrim(d.city)),''),'')  = $2
  AND coalesce(nullif(upper(btrim(d.state)),''),'') = $3`;

export function personFilings(personKey: string) {
  const [nameNorm = "", city = "", state = ""] = personKey.split("|");
  return q<BizFiling>(
    filingSql(`d.debtor_type = 'Individual' AND f.filing_type_id = 'UCC' AND ${PERSON_MATCH}`),
    [nameNorm, city, state],
  );
}

// Co-owners: other people who are principals on the SAME companies as this person
// (person -> their companies -> the other principals on them). Nominees (anyone on
// > 25 companies) excluded; links to a co-owner's person profile when one exists.
export type CoOwner = { name: string; city: string; state: string; shared: number; person_key: string; has_profile: boolean };
export function personCoOwners(personKey: string) {
  const [nameNorm = "", city = ""] = personKey.split("|");
  return q<CoOwner>(
    `WITH me AS (
       SELECT DISTINCT p.entity_num FROM be_principals p
       WHERE upper(btrim(p.first_name))||' '||upper(btrim(p.last_name)) = $1
         AND ($2 = '' OR upper(btrim(p.city)) = $2) AND p.last_name <> ''
       LIMIT 200
     ),
     co AS (
       SELECT upper(btrim(p2.first_name))||' '||upper(btrim(p2.last_name)) AS cname,
              nullif(upper(btrim(p2.city)),'') AS ccity, nullif(upper(btrim(p2.state)),'') AS cstate,
              count(DISTINCT p2.entity_num) AS shared
       FROM me JOIN be_principals p2 ON p2.entity_num = me.entity_num AND p2.last_name <> ''
       WHERE upper(btrim(p2.first_name))||' '||upper(btrim(p2.last_name)) <> $1
       GROUP BY 1, 2, 3
     ),
     guard AS (  -- drop nominees: a co-owner listed on > 25 companies is an agent
       SELECT cname, ccity, cstate, shared FROM co
       WHERE (SELECT count(*) FROM be_principals bp
              WHERE upper(btrim(bp.first_name))||' '||upper(btrim(bp.last_name)) = co.cname) <= 25
     )
     SELECT initcap(lower(g.cname)) AS name, coalesce(g.ccity,'') AS city, coalesce(g.cstate,'') AS state,
            g.shared, g.cname||'|'||coalesce(g.ccity,'')||'|'||coalesce(g.cstate,'') AS person_key,
            (pi.person_key IS NOT NULL) AS has_profile
     FROM guard g
     LEFT JOIN prof_individual pi ON pi.person_key = g.cname||'|'||coalesce(g.ccity,'')||'|'||coalesce(g.cstate,'')
     ORDER BY g.shared DESC, (pi.person_key IS NOT NULL) DESC LIMIT 50`,
    [nameNorm, city],
  );
}

export function personLiens(personKey: string) {
  const [nameNorm = "", city = "", state = ""] = personKey.split("|");
  return q<LienRow>(
    lienSql(`d.debtor_type = 'Individual' AND ${PERSON_MATCH}`),
    [nameNorm, city, state],
  );
}

export type PersonCompany = { biz_norm: string; entity_name: string; entity_type: string; role: string; city: string; state: string };
// California companies this person appears on as a principal (matched by name,
// constrained to the same city when known to cut down on common-name collisions).
// biz_norm = normalize_name(entity_name) so we can link straight to the company
// profile (which is keyed the same way); it 404s gracefully if that company never
// appeared as a UCC debtor.
export function personCompanies(personKey: string) {
  const [nameNorm = "", city = ""] = personKey.split("|");
  return q<PersonCompany>(
    `SELECT DISTINCT normalize_name(e.entity_name) AS biz_norm,
            e.entity_name, e.entity_type, p.position_type AS role,
            coalesce(nullif(p.city,''),'') AS city, coalesce(nullif(p.state,''),'') AS state
     FROM be_principals p
     JOIN be_entities e ON e.entity_num = p.entity_num
     WHERE upper(btrim(p.first_name)) || ' ' || upper(btrim(p.last_name)) = $1
       AND p.last_name <> ''
       AND ($2 = '' OR upper(btrim(p.city)) = $2)
     ORDER BY e.entity_name LIMIT 100`,
    [nameNorm, city],
  );
}
