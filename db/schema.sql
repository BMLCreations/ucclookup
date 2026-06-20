-- ============================================================================
-- ucclookup — California UCC + Business Entity schema (PostgreSQL)
-- This file is the single source of truth for the database design.
-- It runs as-is on PGlite (local proof) AND on Supabase (production).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Name normalization: makes "Joe's Pizza, LLC" and "JOES PIZZA LLC" comparable.
-- Used to link UCC companies <-> business-entity records, and to canonicalize
-- funder names. Kept deterministic so it can back an index.
-- ----------------------------------------------------------------------------
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
          -- strip common entity suffixes / filing-agent noise
          '\m(LLC|L L C|INC|INCORPORATED|CORP|CORPORATION|COMPANY|CO|LP|LLP|LLLP|LTD|PLLC|PC|NA|N A|DBA|AS REPRESENTATIVE|REPRESENTATIVE|TRUST)\M',
          ' ', 'g'),
        '\s+', ' ', 'g')
    ),
  '');
$$;

-- ============================================================================
-- UCC SIDE  (delimiter in source files: "|")
-- ============================================================================

-- One row per filing EVENT (initial financing statement OR an amendment).
-- For an initial filing, ucc1_num = ucc3_num. action_type tells which it is.
CREATE TABLE ucc_filings (
  ucc1_num        text NOT NULL,            -- permanent id of the original filing
  ucc3_num        text NOT NULL,            -- id of this specific event
  filing_date     timestamptz,
  processed_date  timestamptz,
  action_type     text,                     -- 'Lien Financing Stmt' (=initial), 'Continuation', 'Termination', ...
  alt_designation text,
  filing_type_id  text,                     -- 'UCC' vs 'Notice of State Tax Lien' / 'Judgment Lien' / ...
  lapse_date      timestamptz,              -- when this filing auto-expires (~5 yrs); continuations push it out
  page_count      int,
  PRIMARY KEY (ucc1_num, ucc3_num)
);
CREATE INDEX ucc_filings_ucc1       ON ucc_filings (ucc1_num);
CREATE INDEX ucc_filings_type       ON ucc_filings (filing_type_id);
CREATE INDEX ucc_filings_action     ON ucc_filings (action_type);
CREATE INDEX ucc_filings_filing_dt  ON ucc_filings (filing_date);

-- The businesses / people a filing is AGAINST.
CREATE TABLE ucc_debtors (
  ucc1_num     text NOT NULL,
  ucc3_num     text NOT NULL,
  debtor_type  text,                        -- 'Organization' | 'Individual'
  org_name     text,
  last_name    text,
  first_name   text,
  middle_name  text,
  suffix       text,
  addr1 text, addr2 text, addr3 text,
  city text, state text, postal_code text, country text
);
CREATE INDEX ucc_debtors_ucc1     ON ucc_debtors (ucc1_num);
CREATE INDEX ucc_debtors_orgnorm  ON ucc_debtors (normalize_name(org_name));

-- The funders / lenders (secured parties).
CREATE TABLE ucc_secured_parties (
  ucc1_num     text NOT NULL,
  ucc3_num     text NOT NULL,
  party_type   text,
  org_name     text,
  last_name    text,
  first_name   text,
  middle_name  text,
  suffix       text,
  addr1 text, addr2 text, addr3 text,
  city text, state text, postal_code text, country text
);
CREATE INDEX ucc_sp_ucc1     ON ucc_secured_parties (ucc1_num);
CREATE INDEX ucc_sp_orgnorm  ON ucc_secured_parties (normalize_name(org_name));

-- Amendment events linked to an original filing (termination/continuation/etc.).
CREATE TABLE ucc_amendments (
  ucc1_num     text NOT NULL,
  ucc3_num     text NOT NULL,
  action_type  text
);
CREATE INDEX ucc_amend_ucc1 ON ucc_amendments (ucc1_num);

-- ============================================================================
-- BUSINESS ENTITY SIDE  (delimiter in source files: "*|*")
-- ============================================================================

CREATE TABLE be_entities (
  entity_name              text,
  entity_num               text PRIMARY KEY,
  initial_filing_date      text,
  jurisdiction             text,
  entity_status            text,
  standing_sos             text,
  entity_type              text,
  filing_type              text,
  llc_management_structure text,
  last_si_file_date        text,
  principal_addr1 text, principal_addr2 text,
  principal_city text, principal_state text, principal_postal text
);
CREATE INDEX be_entities_namenorm ON be_entities (normalize_name(entity_name));

-- The people who run each entity (directors/managers/members/officers).
CREATE TABLE be_principals (
  entity_name   text,
  entity_num    text,
  org_name      text,
  first_name    text,
  middle_name   text,
  last_name     text,
  position_type text,
  addr1 text, city text, state text, postal_code text
);
CREATE INDEX be_principals_entity   ON be_principals (entity_num);
CREATE INDEX be_principals_person   ON be_principals (upper(last_name), upper(first_name));

-- Registered agents (agent_type flags Individual vs commercial middleman).
CREATE TABLE be_agents (
  entity_name   text,
  entity_num    text,
  org_name      text,
  first_name    text,
  middle_name   text,
  last_name     text,
  addr1 text, city text, state text, postal_code text,
  agent_type    text
);
CREATE INDEX be_agents_entity ON be_agents (entity_num);
