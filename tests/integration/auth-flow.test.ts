/**
 * The real sign-in library against a real database: no sign-up, Argon2id passwords,
 * mandatory authenticator-app MFA, lockout, and no way for app roles to read sign-in data.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { createClient, withDb } from "@/server/data/db";
import type { Actor } from "@/server/policy/actor";
import type { PrismaClient } from "@/generated/prisma/client";

const ORIGIN = "http://localhost:3000";
const PASSWORD = `Pw-${randomBytes(12).toString("hex")}`;
let owner: PrismaClient;
let app: PrismaClient;
let companyId: string;
let handler: (req: Request) => Promise<Response>;
let actorFor: (headers: Headers) => Promise<Actor>;

/** A tiny cookie jar so each "browser" carries its own cookies. */
function browser() {
  const jar = new Map<string, string>();
  const take = (res: Response) => {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair!.indexOf("=");
      const name = pair!.slice(0, i);
      const value = pair!.slice(i + 1);
      if (value === "" || /max-age=0/i.test(line)) jar.delete(name);
      else jar.set(name, value);
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  return {
    jar,
    cookie,
    async post(path: string, body: unknown) {
      const res = await handler(
        new Request(`${ORIGIN}/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: ORIGIN, cookie: cookie() },
          body: JSON.stringify(body),
        }),
      );
      take(res);
      return res;
    },
    actor: () => actorFor(new Headers({ cookie: cookie() })),
  };
}

async function makeUser(email: string, role: "company" | "admin" = "company") {
  const id = randomUUID();
  await owner.user.create({
    data: {
      id,
      name: "Test User",
      email,
      role,
      companyId: role === "company" ? companyId : null,
      accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(PASSWORD) } },
    },
  });
  return id;
}

const secretFrom = (totpURI: string) => new URL(totpURI).searchParams.get("secret")!;

beforeAll(async () => {
  process.env.AUTH_URL = ORIGIN;
  process.env.SESSION_SECRET = randomBytes(32).toString("base64");
  process.env.AUTH_DATABASE_URL = process.env.TEST_AUTH_DATABASE_URL;
  process.env.DATABASE_URL = process.env.TEST_APP_DATABASE_URL;
  const { auth } = await import("@/server/auth/auth");
  const { getActor } = await import("@/server/policy/session");
  handler = (req) => auth().handler(req);
  actorFor = getActor;

  owner = createClient(process.env.TEST_OWNER_DATABASE_URL!);
  app = createClient(process.env.TEST_APP_DATABASE_URL!);
  companyId = (await owner.company.create({ data: { slug: "auth-sample", name: "Auth (sample)", isSample: true } })).id;
});

afterAll(async () => {
  await owner?.$disconnect();
  await app?.$disconnect();
});

describe("accounts", () => {
  it("has no open sign-up", async () => {
    const b = browser();
    const res = await b.post("/sign-up/email", { email: "new@example.com", password: PASSWORD, name: "New" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await owner.user.findUnique({ where: { email: "new@example.com" } })).toBeNull();
  });

  it("stores passwords as Argon2id, never plain text", async () => {
    await makeUser("hash@example.com");
    const account = await owner.account.findFirstOrThrow({ where: { user: { email: "hash@example.com" } } });
    expect(account.password).toMatch(/^\$argon2id\$/);
    expect(account.password).not.toContain(PASSWORD);
  });

  it("the app database roles cannot read sign-in data", async () => {
    for (const role of ["public", "admin"] as const) {
      await expect(withDb({ role }, (tx) => tx.account.findMany(), app)).rejects.toThrow(/permission denied/);
    }
    await expect(withDb({ role: "company", companyId }, (tx) => tx.user.findMany(), app)).rejects.toThrow(/permission denied/);
  });

  it("database rules: company users need a company, admins must not have one", async () => {
    await expect(owner.user.create({ data: { name: "x", email: "bad1@example.com", role: "company" } })).rejects.toThrow();
    await expect(owner.user.create({ data: { name: "x", email: "bad2@example.com", role: "admin", companyId } })).rejects.toThrow();
    await expect(owner.user.create({ data: { name: "x", email: "bad3@example.com", role: "root" } })).rejects.toThrow();
  });
});

describe("sign-in and MFA", () => {
  it("a password alone gives no access until an authenticator app is set up", async () => {
    await makeUser("mfa@example.com");
    const b = browser();
    const res = await b.post("/sign-in/email", { email: "mfa@example.com", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(await b.actor()).toMatchObject({ kind: "mfa_required" });
  });

  it("full journey: enrol, sign out, sign in with a code", async () => {
    const userId = await makeUser("journey@example.com");
    const b = browser();
    await b.post("/sign-in/email", { email: "journey@example.com", password: PASSWORD });

    // Enrol the authenticator app. It is not active until the first code is confirmed.
    const enable = await b.post("/two-factor/enable", { password: PASSWORD });
    expect(enable.status).toBe(200);
    const { totpURI, backupCodes } = (await enable.json()) as { totpURI: string; backupCodes: string[] };
    expect(backupCodes).toHaveLength(10);
    const secret = secretFrom(totpURI);
    expect(await b.actor()).toMatchObject({ kind: "mfa_required" });

    const confirm = await b.post("/two-factor/verify-totp", { code: await generate({ secret }) });
    expect(confirm.status).toBe(200);
    expect(await b.actor()).toEqual({ kind: "company", userId, companyId });

    // The secret and recovery codes are not stored in readable form.
    const stored = await owner.twoFactor.findFirstOrThrow({ where: { userId } });
    expect(stored.secret).not.toContain(secret);
    expect(stored.backupCodes).not.toContain(backupCodes[0]!);

    // New sign-in: password is not enough any more.
    await b.post("/sign-out", {});
    const again = browser();
    const res = await again.post("/sign-in/email", { email: "journey@example.com", password: PASSWORD });
    expect(((await res.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
    expect(await again.actor()).toEqual({ kind: "visitor" });

    const bad = await again.post("/two-factor/verify-totp", { code: "000000" });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(await again.actor()).toEqual({ kind: "visitor" });

    const ok = await again.post("/two-factor/verify-totp", { code: await generate({ secret }) });
    expect(ok.status).toBe(200);
    expect(await again.actor()).toEqual({ kind: "company", userId, companyId });

    // Logging out ends the session at once, server-side.
    const cookieBefore = again.cookie();
    await again.post("/sign-out", {});
    expect(await actorFor(new Headers({ cookie: cookieBefore }))).toEqual({ kind: "visitor" });
  });

  it("a recovery code works once", async () => {
    await makeUser("recover@example.com");
    const b = browser();
    await b.post("/sign-in/email", { email: "recover@example.com", password: PASSWORD });
    const enable = await b.post("/two-factor/enable", { password: PASSWORD });
    const { totpURI, backupCodes } = (await enable.json()) as { totpURI: string; backupCodes: string[] };
    await b.post("/two-factor/verify-totp", { code: await generate({ secret: secretFrom(totpURI) }) });
    await b.post("/sign-out", {});

    const first = browser();
    await first.post("/sign-in/email", { email: "recover@example.com", password: PASSWORD });
    expect((await first.post("/two-factor/verify-backup-code", { code: backupCodes[0] })).status).toBe(200);
    expect(await first.actor()).toMatchObject({ kind: "company" });

    const second = browser();
    await second.post("/sign-in/email", { email: "recover@example.com", password: PASSWORD });
    expect((await second.post("/two-factor/verify-backup-code", { code: backupCodes[0] })).status).toBeGreaterThanOrEqual(400);
    expect(await second.actor()).toEqual({ kind: "visitor" });
  });

  it("wrong password gets the same answer for unknown and known emails", async () => {
    await makeUser("known@example.com");
    const known = await browser().post("/sign-in/email", { email: "known@example.com", password: "wrong-password-123" });
    const unknown = await browser().post("/sign-in/email", { email: "nobody@example.com", password: "wrong-password-123" });
    expect(known.status).toBe(unknown.status);
    expect(((await known.json()) as { message?: string }).message).toBe(((await unknown.json()) as { message?: string }).message);
  });

  it("locks out after 5 sign-in attempts from one connection", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const attempt = () =>
      handler(
        new Request(`${ORIGIN}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip },
          body: JSON.stringify({ email: "lock@example.com", password: "wrong-password-123" }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[6]).toBe(429);
  });

  it("rejects sign-in requests from another website", async () => {
    await makeUser("origin@example.com");
    const res = await handler(
      new Request(`${ORIGIN}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ email: "origin@example.com", password: PASSWORD }),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token"))).toBe(false);
  });
});
