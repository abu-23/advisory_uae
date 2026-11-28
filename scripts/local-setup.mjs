/**
 * One-command local setup for development on your own computer.
 *
 *   pnpm local:setup            (add --email you@example.com to choose the admin email)
 *
 * It starts a local database and Redis with Docker, writes a .env with fresh random secrets
 * (only if there is no .env yet), applies the database structure, adds sample data, and creates
 * one superadmin account. The one-time password for that account is printed once.
 * Local only: the database passwords here are throwaway. Never use this for a real deployment.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const PG_PORT = process.env.LOCAL_PG_PORT ?? "5433";
const REDIS_PORT = process.env.LOCAL_REDIS_PORT ?? "6380";
const DB = process.env.LOCAL_DB_NAME ?? "advisr";
const ENV_FILE = process.env.ENV_FILE ?? ".env";
const SKIP_DOCKER = process.env.SKIP_DOCKER === "1";
const ADMIN_URL = process.env.LOCAL_PG_ADMIN_URL ?? `postgresql://postgres:localdev@localhost:${PG_PORT}/${DB}`;

const emailArg = process.argv.indexOf("--email");
const adminEmail = (emailArg > -1 ? process.argv[emailArg + 1] : undefined) ?? "admin@example.com";

const say = (m) => console.log(`\n==> ${m}`);
function fail(m) {
  console.error(`\nSTOPPED: ${m}\n`);
  process.exit(1);
}
function run(cmd, args, env, capture = false) {
  const r = spawnSync(cmd, args, { stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", shell: true, env: { ...process.env, ...env }, encoding: "utf8" });
  if (r.status !== 0) fail(`"${cmd} ${args.join(" ")}" did not finish. Read the message above it.`);
  return r.stdout ?? "";
}

// 1. Database and Redis
if (!SKIP_DOCKER) {
  say("Starting the database and Redis (Docker)");
  const info = spawnSync("docker", ["info"], { shell: true, stdio: "ignore" });
  if (info.status !== 0) fail("Docker is not running. Open Docker Desktop, wait until it says it is running, then run this again.");
  run("docker", ["compose", "up", "-d", "--wait"]);
}

// 2. .env (never overwritten, and its secrets are never printed)
if (!existsSync(ENV_FILE)) {
  say(`Creating ${ENV_FILE} with new random secrets`);
  const url = (user) => `postgresql://${user}:localdev@localhost:${PG_PORT}/${DB}`;
  writeFileSync(
    ENV_FILE,
    [
      "# Local development only. Created by pnpm local:setup. Never commit this file.",
      "APP_ENV=development",
      `MIGRATION_DATABASE_URL=${url("postgres")}`,
      `DATABASE_URL=${url("advisr_app")}`,
      `AUTH_DATABASE_URL=${url("advisr_auth")}`,
      `REDIS_URL=redis://localhost:${REDIS_PORT}`,
      `SESSION_SECRET=${randomBytes(32).toString("base64")}`,
      "AUTH_URL=http://localhost:3000",
      `FIELD_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
      "",
    ].join("\n"),
  );
} else {
  say(`${ENV_FILE} already exists, keeping it`);
}
const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

// 3. Database structure, then the two restricted logins, then sample data
say("Applying the database structure");
run("pnpm", ["db:migrate"], env);

say("Creating the restricted database logins");
const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect().catch(() => fail("Could not reach the database. Is Docker running?"));
const login = (name, inherit, role) => `
  DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${name}') THEN
    CREATE ROLE ${name} LOGIN ${inherit} PASSWORD 'localdev'; END IF; END $$;`;
await admin.query(login("advisr_app", "NOINHERIT"));
await admin.query("GRANT app_public, app_company, app_admin TO advisr_app");
await admin.query(login("advisr_auth", "INHERIT"));
await admin.query("GRANT app_auth TO advisr_auth");

say("Adding sample data");
run("pnpm", ["db:seed"], env);

// 4. First superadmin
const existing = await admin.query("SELECT 1 FROM app_user WHERE email = $1", [adminEmail.toLowerCase()]);
await admin.end();
let password = null;
if (existing.rowCount === 0) {
  say(`Creating the superadmin account ${adminEmail}`);
  const out = run("pnpm", ["user:create", "--role", "superadmin", "--email", adminEmail, "--name", '"Local Admin"', "--json"], env, true);
  const line = out.split("\n").find((l) => l.startsWith("{"));
  password = line ? JSON.parse(line).password : null;
}

console.log(`
=====================================================================
 Setup finished.

 Start the app:      pnpm dev
 Open (English):     http://localhost:3000/en
 Open (Arabic):      http://localhost:3000/ar
 Sign-in page:       http://localhost:3000/en/sign-in
${
  password
    ? `
 Your sign-in:       ${adminEmail}
 One-time password:  ${password}
 (shown only now: copy it. At first sign-in you will set up an
  authenticator app, such as Microsoft Authenticator or Google Authenticator.)`
    : `
 The account ${adminEmail} already exists, so no new password was made.`
}
=====================================================================
`);
