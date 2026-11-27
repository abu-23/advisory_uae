-- The integrity triggers look up other tables that the calling role may not read
-- (visitors can insert a consent record but never read quote requests).
-- Run them with the owner's rights, with a fixed search_path so they can't be redirected.
ALTER FUNCTION consent_company_matches() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION quote_package_matches() SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION consent_company_matches() FROM PUBLIC;
REVOKE ALL ON FUNCTION quote_package_matches() FROM PUBLIC;
