-- Sign-in tables: who can reach them, and what a user row must look like.

ALTER TABLE app_user
  ADD CONSTRAINT app_user_role_valid CHECK (role IN ('company', 'admin', 'superadmin')),
  -- Company users belong to exactly one company. Admins and superadmins to none.
  ADD CONSTRAINT app_user_company_matches_role CHECK ((role = 'company') = (company_id IS NOT NULL));

-- Only this role can read or write sign-in data. The three app roles get nothing here,
-- so company and admin code can never read password hashes or MFA secrets.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_auth') THEN CREATE ROLE app_auth NOLOGIN; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_user, auth_session, auth_account, auth_verification, auth_two_factor TO app_auth;
GRANT INSERT ON audit_log TO app_auth;
GRANT SELECT (id) ON audit_log TO app_auth;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO app_auth;

-- Defence in depth: the app roles are explicitly denied.
REVOKE ALL ON app_user, auth_session, auth_account, auth_verification, auth_two_factor FROM PUBLIC, app_public, app_company, app_admin;
