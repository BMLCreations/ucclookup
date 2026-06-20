-- ============================================================================
-- Exclusion list — keeps the stacking detector focused on real MCA merchants.
-- Three kinds of noise the first real run exposed:
--   1. Bogus "sovereign citizen" filings (fake liens vs. the Fed / Visa / banks)
--   2. Giant financial institutions & card networks (not merchants)
--   3. Payment processors appearing as debtors (role-reversal noise)
-- This is a seed list; it is meant to grow over time as new junk appears.
-- ============================================================================

CREATE TABLE excluded_names (
  name     text NOT NULL,        -- raw display name (for reference)
  category text NOT NULL         -- bank | card_network | government | processor | bogus_filer
);

INSERT INTO excluded_names (name, category) VALUES
  -- Card networks
  ('VISA',                                'card_network'),
  ('MASTERCARD INTERNATIONAL',            'card_network'),
  ('AMERICAN EXPRESS',                    'card_network'),
  ('DISCOVER FINANCIAL SERVICES',         'card_network'),
  ('DINERS CLUB',                         'card_network'),
  ('JCB INTERNATIONAL',                   'card_network'),
  ('ENROUTE CREDIT CARD',                 'card_network'),
  -- Payment processors (noise when they appear as debtors)
  ('FIRST DATA MERCHANT SERVICES',        'processor'),
  ('FISERV',                              'processor'),
  ('GLOBAL PAYMENTS',                     'processor'),
  ('ELAVON',                              'processor'),
  ('CHASE PAYMENTECH',                    'processor'),
  ('HEARTLAND PAYMENT',                   'processor'),
  ('TSYS',                                'processor'),
  -- Major banks / financial institutions
  ('JPMORGAN CHASE',                      'bank'),
  ('MORGAN STANLEY',                      'bank'),
  ('DEUTSCHE BANK',                       'bank'),
  ('HSBC',                                'bank'),
  ('UBS',                                 'bank'),
  ('STANDARD CHARTERED',                  'bank'),
  ('UNICREDIT',                           'bank'),
  ('CITIGROUP',                           'bank'),
  ('CITIBANK',                            'bank'),
  ('BANK OF AMERICA',                     'bank'),
  ('WELLS FARGO',                         'bank'),
  ('GOLDMAN SACHS',                       'bank'),
  ('U S BANCORP',                         'bank'),
  -- Government / quasi-government
  ('FEDERAL RESERVE',                     'government'),
  ('FEDERAL RESERVE SYSTEM',              'government'),
  ('UNITED STATES DEPARTMENT OF THE TREASURY', 'government'),
  ('US DEPARTMENT OF THE TREASURY',       'government'),
  ('INTERNATIONAL MONETARY FUND',         'government'),
  ('INTERNAL REVENUE SERVICE',            'government'),
  ('CALIFORNIA DEPARTMENT OF TAX AND FEE ADMINISTRATION', 'government'),
  ('EMPLOYMENT DEVELOPMENT DEPARTMENT',   'government'),
  -- Known bogus "sovereign citizen" filers seen in the data
  ('MANSON GLOBAL FUND FINANCIAL SECURITY COMMITTEE', 'bogus_filer'),
  ('MONETARY FUTURE SOVEREIGN HERITAGE FEDERATION',   'bogus_filer'),
  ('MONETARY FUTURE STANDARDS',           'bogus_filer'),
  ('SATCOMM FOUNDATION',                  'bogus_filer');

-- Catches NEW sovereign-citizen junk by its tell-tale grandiose wording,
-- so we are not relying on the seed list alone.
CREATE OR REPLACE FUNCTION is_bogus_name(raw text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(coalesce(raw,'')) ~
    '(SOVEREIGN|MONETARY FUTURE|HERITAGE FEDERATION|GLOBAL FUND FINANCIAL|CESTUI QUE|SECURED PARTY CREDITOR)';
$$;

-- Trusts / estates are not MCA merchants — drop them too.
CREATE OR REPLACE FUNCTION is_non_merchant(raw text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(coalesce(raw,'')) ~
    '(LIVING TRUST|FAMILY TRUST|REVOCABLE TRUST|IRREVOCABLE|AS TRUSTEE|, TRUSTEE)';
$$;

-- True if a name should be dropped from merchant/funder analysis.
CREATE OR REPLACE FUNCTION is_excluded(raw text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT is_bogus_name(raw)
      OR is_non_merchant(raw)
      OR EXISTS (
        SELECT 1 FROM excluded_names e
        WHERE normalize_name(raw) LIKE '%' || normalize_name(e.name) || '%'
      );
$$;
