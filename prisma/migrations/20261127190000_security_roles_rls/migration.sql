-- Security rules Prisma cannot express: data checks, database roles, grants,
-- row-level security (RLS) and an append-only audit log.
--
-- How the app uses this: it logs in as one login role (created outside migrations,
-- see docs/database.md) that is a member of the three NOLOGIN roles below.
-- Every transaction runs `SET LOCAL ROLE <role>` and, for companies,
-- `set_config('app.company_id', <id from session>, true)`.

-- ---------- Data checks ----------
ALTER TABLE "package"
  ADD CONSTRAINT package_money_non_negative CHECK (gov_fees_fils >= 0 AND service_fee_fils >= 0 AND (renewal_fee_fils IS NULL OR renewal_fee_fils >= 0)),
  ADD CONSTRAINT package_turnaround_range CHECK (turnaround_days_min > 0 AND turnaround_days_max >= turnaround_days_min),
  ADD CONSTRAINT package_visas_range CHECK (visas_min >= 0 AND visas_max >= visas_min),
  ADD CONSTRAINT package_has_service CHECK (cardinality(service_types) > 0);

ALTER TABLE "review"
  ADD CONSTRAINT review_rating_range CHECK (rating BETWEEN 1 AND 5),
  ADD CONSTRAINT review_real_needs_request CHECK (is_sample OR quote_request_id IS NOT NULL);

ALTER TABLE "verification_record"
  ADD CONSTRAINT verification_expiry_after_check CHECK (licence_expires_at > checked_at);

ALTER TABLE "consent_record"
  ADD CONSTRAINT consent_locale CHECK (locale IN ('en', 'ar'));

-- A consent record must name the same company as its quote request.
CREATE FUNCTION consent_company_matches() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id <> (SELECT company_id FROM quote_request WHERE id = NEW.quote_request_id) THEN
    RAISE EXCEPTION 'consent company must match the quote request company';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consent_company_matches BEFORE INSERT OR UPDATE ON consent_record
  FOR EACH ROW EXECUTE FUNCTION consent_company_matches();

-- A quote request's package must belong to the same company.
CREATE FUNCTION quote_package_matches() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id <> (SELECT company_id FROM package WHERE id = NEW.package_id) THEN
    RAISE EXCEPTION 'quote request package must belong to the same company';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quote_package_matches BEFORE INSERT OR UPDATE ON quote_request
  FOR EACH ROW EXECUTE FUNCTION quote_package_matches();

-- ---------- Append-only audit log ----------
CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();

-- Verification history is append-only too: corrections are new records.
CREATE TRIGGER verification_no_update BEFORE UPDATE OR DELETE ON verification_record
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- ---------- Current verification (calculated, never stored) ----------
-- Verified only if the latest record is VERIFIED and today is before
-- the licence expiry and before 12 months after the check, whichever is first.
CREATE VIEW company_verification AS
SELECT DISTINCT ON (v.company_id)
  v.company_id,
  v.checked_at,
  v.licence_expires_at,
  (v.status = 'VERIFIED'
    AND now() < LEAST(v.licence_expires_at, v.checked_at + interval '12 months')) AS is_verified
FROM verification_record v
ORDER BY v.company_id, v.checked_at DESC, v.created_at DESC;

-- ---------- Roles ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_public') THEN CREATE ROLE app_public NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_company') THEN CREATE ROLE app_company NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN CREATE ROLE app_admin NOLOGIN; END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_public, app_company, app_admin;

-- The company id for this transaction, from the signed-in session. NULL if not set.
CREATE FUNCTION app_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.company_id', true), '')::uuid
$$;

-- Visitors (public pages and the quote form)
GRANT SELECT (id, slug, name, locations, status, is_sample) ON company TO app_public;
GRANT SELECT ON package, policy_version TO app_public;
GRANT SELECT (company_id, checked_at, licence_expires_at, is_verified) ON company_verification TO app_public;
GRANT SELECT (id, company_id, rating, text, status, is_sample, created_at) ON review TO app_public;
GRANT INSERT ON quote_request, consent_record TO app_public;
GRANT INSERT ON audit_log TO app_public;

-- Company users: own company only (enforced by RLS below)
GRANT SELECT (id, slug, name, locations, status, is_sample) ON company TO app_company;
GRANT SELECT, INSERT, UPDATE ON package TO app_company;
GRANT SELECT ON company_verification, policy_version TO app_company;
GRANT SELECT ON quote_request, consent_record TO app_company;
GRANT UPDATE (status) ON quote_request TO app_company;
GRANT SELECT (id, company_id, rating, text, status, created_at) ON review TO app_company;
GRANT SELECT, INSERT ON licence_document TO app_company;
GRANT INSERT ON audit_log TO app_company;

-- Admins: verification, moderation, audit view. No access to customer contact columns.
GRANT SELECT, UPDATE ON company TO app_admin;
GRANT INSERT ON company TO app_admin;
GRANT SELECT ON package, company_verification, policy_version TO app_admin;
GRANT SELECT, INSERT ON verification_record TO app_admin;
GRANT SELECT ON licence_document TO app_admin;
GRANT UPDATE (scan_status) ON licence_document TO app_admin;
GRANT SELECT, UPDATE (status) ON review TO app_admin;
GRANT SELECT (id, company_id, package_id, status, created_at, delete_after) ON quote_request TO app_admin;
GRANT SELECT, INSERT ON audit_log TO app_admin;

GRANT USAGE ON SEQUENCE audit_log_id_seq TO app_public, app_company, app_admin;
-- Inserts return the new id; visitors and companies can read nothing else in the log.
GRANT SELECT (id) ON audit_log TO app_public, app_company;

-- ---------- Row-level security ----------
-- Table owners (migrations, seed) bypass RLS. App roles never own tables.
ALTER TABLE company ENABLE ROW LEVEL SECURITY;
ALTER TABLE package ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE licence_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE review ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_record ENABLE ROW LEVEL SECURITY;

-- company
CREATE POLICY company_public_read ON company FOR SELECT TO app_public USING (status = 'ACTIVE');
CREATE POLICY company_own_read ON company FOR SELECT TO app_company USING (id = app_company_id());
CREATE POLICY company_admin_all ON company FOR ALL TO app_admin USING (true) WITH CHECK (true);

-- package
CREATE POLICY package_public_read ON package FOR SELECT TO app_public
  USING (status = 'LIVE' AND EXISTS (SELECT 1 FROM company c WHERE c.id = company_id AND c.status = 'ACTIVE'));
CREATE POLICY package_own ON package FOR ALL TO app_company
  USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
CREATE POLICY package_admin_read ON package FOR SELECT TO app_admin USING (true);

-- quote_request: visitors can only insert; companies see only their own
CREATE POLICY quote_public_insert ON quote_request FOR INSERT TO app_public WITH CHECK (status = 'NEW');
CREATE POLICY quote_own_read ON quote_request FOR SELECT TO app_company USING (company_id = app_company_id());
CREATE POLICY quote_own_update ON quote_request FOR UPDATE TO app_company
  USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
CREATE POLICY quote_admin_read ON quote_request FOR SELECT TO app_admin USING (true);

-- consent_record
CREATE POLICY consent_public_insert ON consent_record FOR INSERT TO app_public WITH CHECK (withdrawn_at IS NULL);
CREATE POLICY consent_own_read ON consent_record FOR SELECT TO app_company USING (company_id = app_company_id());

-- licence_document
CREATE POLICY doc_own ON licence_document FOR ALL TO app_company
  USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
CREATE POLICY doc_admin ON licence_document FOR ALL TO app_admin USING (true) WITH CHECK (true);

-- review
CREATE POLICY review_public_read ON review FOR SELECT TO app_public USING (status = 'PUBLISHED');
CREATE POLICY review_own_read ON review FOR SELECT TO app_company USING (company_id = app_company_id() AND status = 'PUBLISHED');
CREATE POLICY review_admin ON review FOR ALL TO app_admin USING (true) WITH CHECK (true);

-- verification_record: admins only (the public sees the calculated view)
CREATE POLICY verification_admin ON verification_record FOR ALL TO app_admin USING (true) WITH CHECK (true);

-- The view runs with the owner's rights so visitors see only its four columns.
-- It exposes no admin ids or document references.
