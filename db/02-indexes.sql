-- Indexes — created AFTER bulk load for speed. Mirrors schema.sql.
CREATE INDEX IF NOT EXISTS ucc_filings_ucc1      ON ucc_filings (ucc1_num);
CREATE INDEX IF NOT EXISTS ucc_filings_type      ON ucc_filings (filing_type_id);
CREATE INDEX IF NOT EXISTS ucc_filings_action    ON ucc_filings (action_type);
CREATE INDEX IF NOT EXISTS ucc_filings_filing_dt ON ucc_filings (filing_date);

CREATE INDEX IF NOT EXISTS ucc_debtors_ucc1     ON ucc_debtors (ucc1_num);
CREATE INDEX IF NOT EXISTS ucc_debtors_orgnorm  ON ucc_debtors (normalize_name(org_name));

CREATE INDEX IF NOT EXISTS ucc_sp_ucc1     ON ucc_secured_parties (ucc1_num);
CREATE INDEX IF NOT EXISTS ucc_sp_orgnorm  ON ucc_secured_parties (normalize_name(org_name));

CREATE INDEX IF NOT EXISTS ucc_amend_ucc1 ON ucc_amendments (ucc1_num);

CREATE INDEX IF NOT EXISTS be_entities_namenorm ON be_entities (normalize_name(entity_name));
CREATE INDEX IF NOT EXISTS be_entities_num      ON be_entities (entity_num);

CREATE INDEX IF NOT EXISTS be_principals_entity ON be_principals (entity_num);
CREATE INDEX IF NOT EXISTS be_principals_person ON be_principals (upper(last_name), upper(first_name));

CREATE INDEX IF NOT EXISTS be_agents_entity ON be_agents (entity_num);
