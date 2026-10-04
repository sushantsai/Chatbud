-- Trigger functions reference only schema-qualified objects; pin their search path.
ALTER FUNCTION shop.check_supplement_batch() SET search_path = pg_catalog;
ALTER FUNCTION finance.guard_posted_header() SET search_path = pg_catalog;
ALTER FUNCTION finance.guard_posted_posting() SET search_path = pg_catalog;
ALTER FUNCTION finance.check_ledger_balance() SET search_path = pg_catalog;
