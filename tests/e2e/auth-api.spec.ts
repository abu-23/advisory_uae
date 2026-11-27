/**
 * Sign-in, MFA and protected endpoints through the real running app (cookies, routes, origin rule).
 * Needs MIGRATION_DATABASE_URL so it can create throwaway accounts with the same script operators use.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { generate } from "otplib";

const PW_BASE = `http://localhost:${process.env.E2E_PORT ?? 3300}`;
const json = { origin: PW_BASE, "content-type": "application/json" };
const run = randomBytes(4).toString("hex");

type Account = { email: string; password: string };

function createAccount(role: "company" | "admin", companySlug?: string): Account {
  const email = `${role}-${companySlug ?? "x"}-${run}@example.com`;
  const args = ["user:create", "--role", role, "--email", email, "--name", "E2E Person (sample)", "--json"];
  if (companySlug) args.push("--company-slug", companySlug);
  const out = execFileSync("pnpm", args, { env: process.env, encoding: "utf8" });
  const line = out.split("\n").find((l) => l.startsWith("{"))!;
  return { email, password: (JSON.parse(line) as { password: string }).password };
}

async function signIn(request: APIRequestContext, a: Account) {
  const res = await request.post("/api/auth/sign-in/email", { headers: json, data: { email: a.email, password: a.password } });
  expect(res.status()).toBe(200);
}

/** Password, then authenticator app setup, then the first code: the first-login journey. */
async function signInWithMfa(request: APIRequestContext, a: Account) {
  await signIn(request, a);
  const enable = await request.post("/api/auth/two-factor/enable", { headers: json, data: { password: a.password } });
  expect(enable.status()).toBe(200);
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret")!;
  const verify = await request.post("/api/auth/two-factor/verify-totp", { headers: json, data: { code: await generate({ secret }) } });
  expect(verify.status()).toBe(200);
}

let companyAccount: Account;
let otherCompanyAccount: Account;
let adminAccount: Account;
let pendingAccount: Account;
test.beforeAll(() => {
  pendingAccount = createAccount("company", "desert-rose-sample");
  companyAccount = createAccount("company", "al-noor-sample");
  otherCompanyAccount = createAccount("company", "harbor-gate-sample");
  adminAccount = createAccount("admin");
});

test("visitors are refused on every protected endpoint", async ({ request }) => {
  for (const path of ["/api/v1/company/packages", "/api/v1/company/quotes", "/api/v1/admin/audit"]) {
    expect((await request.get(path)).status(), path).toBe(401);
  }
  expect((await request.post("/api/v1/admin/verification", { headers: json, data: {} })).status()).toBe(401);
});

test("a password alone is not enough: no access until MFA is set up", async ({ request }) => {
  await signIn(request, pendingAccount);
  expect((await request.get("/api/v1/company/packages")).status()).toBe(401);
});

test("company user: own data only, no way to reach another company", async ({ request, playwright }) => {
  await signInWithMfa(request, companyAccount);

  const mine = await request.get("/api/v1/company/packages");
  expect(mine.status()).toBe(200);
  const packages = ((await mine.json()) as { packages: { id: string; serviceFeeFils: number }[] }).packages;
  expect(packages.length).toBeGreaterThan(0);
  const myId = packages[0]!.id;
  const originalFee = packages[0]!.serviceFeeFils;

  // Find the other company's package id with the other company's own session.
  const other = await playwright.request.newContext({ baseURL: PW_BASE });
  await signInWithMfa(other, otherCompanyAccount);
  const theirId = ((await (await other.get("/api/v1/company/packages")).json()) as { packages: { id: string }[] }).packages[0]!.id;
  expect(theirId).not.toBe(myId);

  // Cannot change it, even with a valid session, a valid id and a valid body.
  const patch = (id: string, data: unknown, headers: Record<string, string> = json) =>
    request.patch(`/api/v1/company/packages/${id}`, { headers, data });
  expect((await patch(theirId, { serviceFeeFils: 1 })).status()).toBe(404);
  // Cannot smuggle in another company, a status, or a verification field.
  for (const body of [{ companyId: "00000000-0000-4000-8000-000000000000" }, { status: "LIVE" }, { verified: true }]) {
    expect((await patch(myId, body)).status()).toBe(400);
  }
  // Writes need to come from our own site, and be JSON.
  expect((await patch(myId, { serviceFeeFils: 9900 }, { "content-type": "application/json" })).status()).toBe(403);
  expect((await patch(myId, { serviceFeeFils: 9900 }, { origin: "https://evil.example", "content-type": "application/json" })).status()).toBe(403);
  expect((await patch(myId, { serviceFeeFils: originalFee + 100 })).status()).toBe(200);
  // Put the shared sample data back so other tests see the same prices.
  expect((await patch(myId, { serviceFeeFils: originalFee })).status()).toBe(200);

  // Company users cannot reach admin endpoints.
  expect((await request.get("/api/v1/admin/audit")).status()).toBe(403);
  expect((await request.post("/api/v1/admin/verification", { headers: json, data: {} })).status()).toBe(403);

  // Responses are never cached.
  expect(mine.headers()["cache-control"]).toBe("no-store");
  await other.dispose();
});

test("admin: audit log yes, company endpoints no, sign-out ends the session", async ({ request }) => {
  await signInWithMfa(request, adminAccount);
  const audit = await request.get("/api/v1/admin/audit");
  expect(audit.status()).toBe(200);
  expect(JSON.stringify(await audit.json())).not.toMatch(/@example\.com|password/i);
  expect((await request.get("/api/v1/company/packages")).status()).toBe(403);
  // Bad input is rejected, not guessed at.
  expect((await request.post("/api/v1/admin/verification", { headers: json, data: { companyId: "x" } })).status()).toBe(400);

  // Signing out ends the session at once, server-side.
  await request.post("/api/auth/sign-out", { headers: json, data: {} });
  expect((await request.get("/api/v1/admin/audit")).status()).toBe(401);
});
