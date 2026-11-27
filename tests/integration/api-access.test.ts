/**
 * Access rules at the endpoint level, against a real database.
 * The actors here are what the sign-in layer produces (covered in auth-flow.test.ts).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getQuoteContact, listOwnPackages, listOwnQuotes, updateOwnPackage } from "@/server/api/company";
import { listAudit, setVerification } from "@/server/api/admin";
import { contactContext, encryptField, LocalKeyProvider } from "@/server/crypto/field-encryption";
import { createClient } from "@/server/data/db";
import type { Actor } from "@/server/policy/actor";
import type { PrismaClient } from "@/generated/prisma/client";

const keys = new LocalKeyProvider(randomBytes(32).toString("base64"));
const EMAIL = "customer@example.com";
const NAME = "Customer Person (sample)";

let owner: PrismaClient;
let app: PrismaClient;
const id = {} as Record<"A" | "B", { company: string; pkg: string; quoteConsented: string; quoteNoConsent: string; quoteWithdrawn: string }>;
let actorA: Actor, actorB: Actor;
const visitor: Actor = { kind: "visitor" };
const mfa: Actor = { kind: "mfa_required", userId: randomUUID() };
const admin: Actor = { kind: "admin", userId: randomUUID() };

const status = async (p: Promise<{ status: number }>) => {
  try {
    return (await p).status;
  } catch (e) {
    return (e as { status?: number }).status ?? 500;
  }
};

async function quote(companyId: string, packageId: string, consent: "yes" | "none" | "withdrawn") {
  const q = randomUUID();
  await owner.quoteRequest.create({
    data: {
      id: q,
      companyId,
      packageId,
      answers: { location: "DUBAI_MAINLAND" },
      contactNameEnc: new Uint8Array(await encryptField(keys, NAME, contactContext.name(q))),
      contactValueEnc: new Uint8Array(await encryptField(keys, EMAIL, contactContext.value(q))),
      contactType: "EMAIL",
      keyId: keys.keyId,
      deleteAfter: new Date(Date.now() + 365 * 864e5),
    },
  });
  if (consent !== "none") {
    await owner.consentRecord.create({
      data: {
        quoteRequestId: q,
        companyId,
        policyVersion: "a1",
        consentTextHash: "h",
        locale: "en",
        acceptedAt: new Date(),
        withdrawnAt: consent === "withdrawn" ? new Date() : null,
      },
    });
  }
  return q;
}

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.TEST_APP_DATABASE_URL;
  owner = createClient(process.env.TEST_OWNER_DATABASE_URL!);
  app = createClient(process.env.TEST_APP_DATABASE_URL!);
  await owner.policyVersion.create({ data: { version: "a1", textEn: "t", textAr: "t", publishedAt: new Date() } });
  for (const k of ["A", "B"] as const) {
    const company = await owner.company.create({ data: { slug: `acc-${k.toLowerCase()}-sample`, name: `Company ${k} (sample)`, isSample: true } });
    const pkg = await owner.package.create({
      data: {
        companyId: company.id,
        serviceTypes: ["EJARI"],
        titleEn: `Package ${k}`,
        titleAr: "t",
        govFeesFils: 100,
        serviceFeeFils: 1000,
        turnaroundDaysMin: 1,
        turnaroundDaysMax: 2,
        priceUpdatedAt: new Date(),
        status: "LIVE",
      },
    });
    id[k] = {
      company: company.id,
      pkg: pkg.id,
      quoteConsented: await quote(company.id, pkg.id, "yes"),
      quoteNoConsent: await quote(company.id, pkg.id, "none"),
      quoteWithdrawn: await quote(company.id, pkg.id, "withdrawn"),
    };
  }
  actorA = { kind: "company", userId: randomUUID(), companyId: id.A.company };
  actorB = { kind: "company", userId: randomUUID(), companyId: id.B.company };
});

afterAll(async () => {
  await owner?.$disconnect();
  await app?.$disconnect();
});

describe("Company A cannot touch Company B", () => {
  it("lists only its own packages", async () => {
    const res = await listOwnPackages(actorA);
    const titles = (res.body as { packages: { titleEn: string }[] }).packages.map((p) => p.titleEn);
    expect(titles).toEqual(["Package A"]);
  });

  it("cannot change B's package: 404 and nothing changes", async () => {
    expect(await status(updateOwnPackage(actorA, id.B.pkg, { serviceFeeFils: 1 }))).toBe(404);
    expect((await owner.package.findUniqueOrThrow({ where: { id: id.B.pkg } })).serviceFeeFils).toBe(1000);
  });

  it("can change its own package, and the change is audited", async () => {
    expect(await status(updateOwnPackage(actorA, id.A.pkg, { serviceFeeFils: 2500, renewalFeeFils: null }))).toBe(200);
    const row = await owner.package.findUniqueOrThrow({ where: { id: id.A.pkg } });
    expect(row.serviceFeeFils).toBe(2500);
    expect(Date.now() - row.priceUpdatedAt.getTime()).toBeLessThan(60_000);
    const log = await owner.auditLog.findFirst({ where: { targetId: id.A.pkg, action: "package.update" } });
    expect(log?.actorId).toBe((actorA as { userId: string }).userId);
  });

  it("cannot send B's company id, or any field that is not a price", async () => {
    for (const body of [
      { companyId: id.B.company },
      { company_id: id.B.company },
      { status: "LIVE" },
      { verified: true },
      { verificationStatus: "VERIFIED" },
      { govFeesFils: 0 },
      { serviceFeeFils: 1, isSample: false },
      { serviceFeeFils: -5 },
      { serviceFeeFils: "1" },
      { turnaroundDaysMin: 5, turnaroundDaysMax: 2 },
      {},
      null,
      "text",
    ]) {
      expect(await status(updateOwnPackage(actorA, id.A.pkg, body)), JSON.stringify(body)).toBe(400);
    }
    expect((await owner.package.findUniqueOrThrow({ where: { id: id.A.pkg } })).companyId).toBe(id.A.company);
  });

  it("sees only its own quote requests, with no contact details", async () => {
    const res = await listOwnQuotes(actorA);
    const quotes = (res.body as { quotes: { id: string; contactAvailable: boolean }[] }).quotes;
    expect(quotes.map((q) => q.id).sort()).toEqual([id.A.quoteConsented, id.A.quoteNoConsent, id.A.quoteWithdrawn].sort());
    expect(quotes.find((q) => q.id === id.A.quoteConsented)?.contactAvailable).toBe(true);
    expect(quotes.find((q) => q.id === id.A.quoteNoConsent)?.contactAvailable).toBe(false);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(NAME);
    expect(text).not.toMatch(/contactNameEnc|contactValueEnc/);
  });

  it("contact details: own request with consent only", async () => {
    const reveal = (a: Actor, q: string) => getQuoteContact(a, q, undefined, { keys });
    const ok = await reveal(actorA, id.A.quoteConsented);
    expect(ok.body).toEqual({ contact: { name: NAME, value: EMAIL, type: "EMAIL" } });
    expect(await status(reveal(actorA, id.A.quoteNoConsent))).toBe(404);
    expect(await status(reveal(actorA, id.A.quoteWithdrawn))).toBe(404);
    expect(await status(reveal(actorA, id.B.quoteConsented))).toBe(404);
    expect(await status(reveal(actorB, id.A.quoteConsented))).toBe(404);
    expect(await status(reveal(actorA, "not-a-uuid"))).toBe(404);
  });

  it("denied attempts are in the audit log", async () => {
    const denied = await owner.auditLog.count({ where: { targetId: id.B.quoteConsented, action: "contact.reveal_denied" } });
    expect(denied).toBeGreaterThanOrEqual(1);
  });
});

describe("who may call company endpoints", () => {
  it("visitors and people without MFA get 401, admins get 403", async () => {
    for (const call of [
      (a: Actor) => listOwnPackages(a),
      (a: Actor) => listOwnQuotes(a),
      (a: Actor) => updateOwnPackage(a, id.A.pkg, { serviceFeeFils: 1 }),
      (a: Actor) => getQuoteContact(a, id.A.quoteConsented, undefined, { keys }),
    ]) {
      expect(await status(call(visitor))).toBe(401);
      expect(await status(call(mfa))).toBe(401);
      expect(await status(call(admin))).toBe(403);
    }
  });
});

describe("verification is admin-only", () => {
  const body = (companyId: string) => ({
    companyId,
    status: "VERIFIED",
    checkedAt: new Date(Date.now() - 864e5).toISOString(),
    licenceExpiresAt: new Date(Date.now() + 200 * 864e5).toISOString(),
  });
  const isVerified = async (companyId: string) =>
    (await owner.$queryRaw<{ is_verified: boolean }[]>`SELECT is_verified FROM company_verification WHERE company_id = ${companyId}::uuid`)[0]?.is_verified ?? false;

  it("company users, visitors and no-MFA sessions cannot set it", async () => {
    expect(await status(setVerification(actorA, body(id.A.company)))).toBe(403);
    expect(await status(setVerification(visitor, body(id.A.company)))).toBe(401);
    expect(await status(setVerification(mfa, body(id.A.company)))).toBe(401);
    expect(await isVerified(id.A.company)).toBe(false);
  });

  it("an admin can, and who did it comes from the session", async () => {
    expect(await status(setVerification(admin, body(id.A.company)))).toBe(201);
    expect(await isVerified(id.A.company)).toBe(true);
    const rec = await owner.verificationRecord.findFirstOrThrow({ where: { companyId: id.A.company } });
    expect(rec.checkedBy).toBe((admin as { userId: string }).userId);
    expect(await owner.auditLog.count({ where: { targetId: id.A.company, action: "verification.set" } })).toBe(1);
  });

  it("rejects extra fields (such as checkedBy), bad dates and unknown companies", async () => {
    expect(await status(setVerification(admin, { ...body(id.B.company), checkedBy: randomUUID() }))).toBe(400);
    expect(await status(setVerification(admin, { ...body(id.B.company), licenceExpiresAt: new Date(Date.now() - 864e5 * 5).toISOString() }))).toBe(400);
    expect(await status(setVerification(admin, { ...body(id.B.company), checkedAt: new Date(Date.now() + 864e5 * 30).toISOString() }))).toBe(400);
    expect(await status(setVerification(admin, body(randomUUID())))).toBe(404);
    expect(await isVerified(id.B.company)).toBe(false);
  });

  it("revoking removes the badge", async () => {
    expect(await status(setVerification(admin, { ...body(id.A.company), status: "REVOKED" }))).toBe(201);
    expect(await isVerified(id.A.company)).toBe(false);
  });
});

describe("audit log view", () => {
  it("admins only, and it holds no personal data", async () => {
    expect(await status(listAudit(actorA))).toBe(403);
    expect(await status(listAudit(visitor))).toBe(401);
    const res = await listAudit(admin);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(NAME);
    expect((res.body as { entries: unknown[] }).entries.length).toBeGreaterThan(0);
  });
});
