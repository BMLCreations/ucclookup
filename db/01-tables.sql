-- Tables + helper function only (NO indexes) — for fast bulk COPY loads.
-- Indexes are added afterward by 02-indexes.sql.

CREATE OR REPLACE FUNCTION normalize_name(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(upper(coalesce(raw, '')), '[.,/#!$%^&*;:{}=_`~()''"-]', ' ', 'g'),
          '\m(LLC|L L C|INC|INCORPORATED|CORP|CORPORATION|COMPANY|CO|LP|LLP|LLLP|LTD|PLLC|PC|NA|N A|DBA|AS REPRESENTATIVE|REPRESENTATIVE|TRUST)\M',
          ' ', 'g'),
        '\s+', ' ', 'g')
    ),
  '');
$$;

CREATE UNLOGGED TABLE IF NOT EXISTS ucc_filings (
  ucc1_num text, ucc3_num text, filing_date timestamptz, processed_date timestamptz,
  action_type text, alt_designation text, filing_type_id text, lapse_date timestamptz, page_count int
);
CREATE UNLOGGED TABLE IF NOT EXISTS ucc_debtors (
  ucc1_num text, ucc3_num text, debtor_type text, org_name text,
  last_name text, first_name text, middle_name text, suffix text,
  addr1 text, addr2 text, addr3 text, city text, state text, postal_code text, country text
);
CREATE UNLOGGED TABLE IF NOT EXISTS ucc_secured_parties (
  ucc1_num text, ucc3_num text, party_type text, org_name text,
  last_name text, first_name text, middle_name text, suffix text,
  addr1 text, addr2 text, addr3 text, city text, state text, postal_code text, country text
);
CREATE UNLOGGED TABLE IF NOT EXISTS ucc_amendments (ucc1_num text, ucc3_num text, action_type text);

CREATE UNLOGGED TABLE IF NOT EXISTS be_entities (
  entity_name text, entity_num text, initial_filing_date text, jurisdiction text,
  entity_status text, standing_sos text, entity_type text, filing_type text,
  llc_management_structure text, last_si_file_date text,
  principal_addr1 text, principal_addr2 text, principal_city text, principal_state text, principal_postal text
);
CREATE UNLOGGED TABLE IF NOT EXISTS be_principals (
  entity_name text, entity_num text, org_name text,
  first_name text, middle_name text, last_name text, position_type text,
  addr1 text, city text, state text, postal_code text
);
CREATE UNLOGGED TABLE IF NOT EXISTS be_agents (
  entity_name text, entity_num text, org_name text,
  first_name text, middle_name text, last_name text,
  addr1 text, city text, state text, postal_code text, agent_type text
);
