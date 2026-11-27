/**
 * Creates a fresh test database, applies migrations, and creates a login role
 * for the app that is a member of the three restricted roles (like production).
 * Needs TEST_ADMIN_DATABASE_URL: a local or CI Postgres superuser. Never production.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";

const DB_NAME = "advisr_test";
const APP_LOGIN = "advisr_app_test";
const AUTH_LOGIN = "advisr_auth_test";

export default async function setup() {
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
  if (!adminUrl) throw new Error("Set TEST_ADMIN_DATABASE_URL to a local/CI Postgres superuser URL");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run tests in production");

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB_NAME}`);

  const ownerUrl = new URL(adminUrl);
  ownerUrl.pathname = `/${DB_NAME}`;
  execFileSync("pnpm", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl.toString() },
    stdio: "inherit",
  });

  // Random per run; never stored.
  const password = randomBytes(24).toString("hex");
  await admin.query(`DROP ROLE IF EXISTS ${APP_LOGIN}`);
  await admin.query(`CREATE ROLE ${APP_LOGIN} LOGIN NOINHERIT PASSWORD '${password}'`);
  await admin.query(`GRANT app_public, app_company, app_admin TO ${APP_LOGIN}`);
  // The sign-in library's own login: reaches the sign-in tables only.
  const authPassword = randomBytes(24).toString("hex");
  await admin.query(`DROP ROLE IF EXISTS ${AUTH_LOGIN}`);
  await admin.query(`CREATE ROLE ${AUTH_LOGIN} LOGIN PASSWORD '${authPassword}'`);
  await admin.query(`GRANT app_auth TO ${AUTH_LOGIN}`);
  await admin.end();

  const appUrl = new URL(ownerUrl);
  appUrl.username = APP_LOGIN;
  appUrl.password = password;

  const authUrl = new URL(ownerUrl);
  authUrl.username = AUTH_LOGIN;
  authUrl.password = authPassword;

  process.env.TEST_OWNER_DATABASE_URL = ownerUrl.toString();
  process.env.TEST_AUTH_DATABASE_URL = authUrl.toString();
  process.env.TEST_APP_DATABASE_URL = appUrl.toString();
}
