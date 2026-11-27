/**
 * Database-level access rules. These run against a real Postgres with the
 * real migrations, as the same kind of restricted login the app uses.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, withDb } from "@/server/data/db";
import type { PrismaClient } from "@/generated/prisma/client";

let owner: PrismaClient;
let app: PrismaClient;
const ids = {} as {
  companyA: string;
  companyB: string;
  pkgA: string;
  pkgB: string;
  quoteA: string;
  quoteB: string;
};

const pkgData = (companyId: string, status: "LIVE" | "DRAFT" = "LIVE") => ({
  companyId,
  serviceTypes: ["TRADE_LICENSE" as const],
  locations: ["DUBAI_MAINLAND" as const],
  titleEn: "Test package",
  titleAr: "باقة اختبار",
  govFeesFils: 730000,
  serviceFeeFils: 100000,
  renewalFeeFils: null,
  turnaroundDaysMin: 1,
  turnaroundDaysMax: 2,
  priceUpdatedAt: new Date(),
  status,
});

const quoteData = (companyId: string, packageId: string) => ({
  companyId,
  packageId,
  answers: { location: "DUBAI_MAINLAND" },
  contactNameEnc: Buffer.from("ciphertext-name"),
  contactValueEnc: Buffer.from("ciphertext-value"),
  contactType: "EMAIL" as const,
  keyId: "test-key",
  deleteAfter: new Date(Date.now() + 365 * 864e5),
});

const asA = <T>(fn: Parameters<typeof withDb<T>>[1]) => withDb({ role: "company", companyId: ids.companyA }, fn, app);
const asPublic = <T>(fn: Parameters<typeof withDb<T>>[1]) => withDb({ role: "public" }, fn, app);
const asAdmin = <T>(fn: Parameters<typeof withDb<T>>[1]) => withDb({ role: "admin" }, fn, app);

beforeAll(async () => {
  owner = createClient(process.env.TEST_OWNER_DATABASE_URL!);
  app = createClient(process.env.TEST_APP_DATABASE_URL!);

  const a = await owner.company.create({ data: { slug: "a-sample", name: "Company A (sample)", isSample: true } });
  const b = await owner.company.create({ data: { slug: "b-sample", name: "Company B (sample)", isSample: true } });
  ids.companyA = a.id;
  ids.companyB = b.id;
  ids.pkgA = (await owner.package.create({ data: pkgData(a.id) })).id;
  ids.pkgB = (await owner.package.create({ data: pkgData(b.id) })).id;
  await owner.package.create({ data: pkgData(b.id, "DRAFT") });
  ids.quoteA = (await owner.quoteRequest.create({ data: quoteData(a.id, ids.pkgA) })).id;
  ids.quoteB = (await owner.quoteRequest.create({ data: quoteData(b.id, ids.pkgB) })).id;
  await owner.policyVersion.create({ data: { version: "t1", textEn: "t", textAr: "t", publishedAt: new Date() } });
});

afterAll(async () => {
  await owner?.$disconnect();
  await app?.$disconnect();
});

describe("company isolation (Company A cannot touch Company B)", () => {
  it("sees only its own packages", async () => {
    const pkgs = await asA((tx) => tx.package.findMany());
    expect(pkgs.map((p) => p.companyId)).toEqual([ids.companyA]);
  });

  it("gets nothing when asking for B's package by id", async () => {
    expect(await asA((tx) => tx.package.findUnique({ where: { id: ids.pkgB } }))).toBeNull();
  });

  it("cannot update or delete B's package", async () => {
    const updated = await asA((tx) => tx.package.updateMany({ where: { id: ids.pkgB }, data: { titleEn: "hacked" } }));
    expect(updated.count).toBe(0);
    await expect(asA((tx) => tx.package.deleteMany({ where: { id: ids.pkgB } }))).rejects.toThrow();
    const still = await owner.package.findUniqueOrThrow({ where: { id: ids.pkgB } });
    expect(still.titleEn).toBe("Test package");
  });

  it("cannot create a package for B, even by sending B's company id", async () => {
    await expect(asA((tx) => tx.package.create({ data: pkgData(ids.companyB) }))).rejects.toThrow();
  });

  it("cannot move its own package to B", async () => {
    await expect(
      asA((tx) => tx.package.update({ where: { id: ids.pkgA }, data: { companyId: ids.companyB } })),
    ).rejects.toThrow();
  });

  it("sees only its own quote requests and cannot change B's", async () => {
    const quotes = await asA((tx) => tx.quoteRequest.findMany({ select: { id: true } }));
    expect(quotes.map((q) => q.id)).toEqual([ids.quoteA]);
    const changed = await asA((tx) =>
      tx.quoteRequest.updateMany({ where: { id: ids.quoteB }, data: { status: "CLOSED" } }),
    );
    expect(changed.count).toBe(0);
  });

  it("sees no rows at all when the company id is missing", async () => {
    const rows = await withDb({ role: "public" }, async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE app_company");
      return tx.package.findMany();
    }, app);
    expect(rows).toHaveLength(0);
  });

  it("rejects a malformed company id before touching the database", async () => {
    await expect(withDb({ role: "company", companyId: "1 OR 1=1" }, async () => 1, app)).rejects.toThrow(
      /Invalid company id/,
    );
  });
});

describe("verification is admin-only", () => {
  const record = () => ({
    companyId: ids.companyA,
    status: "VERIFIED" as const,
    checkedAt: new Date(),
    licenceExpiresAt: new Date(Date.now() + 100 * 864e5),
    checkedBy: "00000000-0000-4000-8000-000000000001",
  });

  it("companies cannot write verification records", async () => {
    await expect(asA((tx) => tx.verificationRecord.create({ data: record() }))).rejects.toThrow(/permission denied/);
  });

  it("visitors cannot write verification records", async () => {
    await expect(asPublic((tx) => tx.verificationRecord.create({ data: record() }))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("admins can, and records cannot be edited afterwards", async () => {
    const created = await asAdmin((tx) => tx.verificationRecord.create({ data: record() }));
    await expect(
      owner.verificationRecord.update({ where: { id: created.id }, data: { status: "REVOKED" } }),
    ).rejects.toThrow(/append-only/);
  });

  it("an old check is no longer verified (12-month rule)", async () => {
    const c = await owner.company.create({ data: { slug: "old-sample", name: "Old (sample)", isSample: true } });
    const checkedAt = new Date(Date.now() - 400 * 864e5);
    await owner.verificationRecord.create({
      data: { ...record(), companyId: c.id, checkedAt, licenceExpiresAt: new Date(Date.now() + 100 * 864e5) },
    });
    const rows = await owner.$queryRaw<{ is_verified: boolean }[]>`
      SELECT is_verified FROM company_verification WHERE company_id = ${c.id}::uuid`;
    expect(rows[0]?.is_verified).toBe(false);
  });
});

describe("customer contact details", () => {
  it("visitors cannot read any quote request", async () => {
    await expect(asPublic((tx) => tx.quoteRequest.findMany())).rejects.toThrow(/permission denied/);
  });

  it("admins cannot read encrypted contact columns", async () => {
    await expect(asAdmin((tx) => tx.quoteRequest.findMany())).rejects.toThrow(/permission denied/);
    const safe = await asAdmin((tx) => tx.quoteRequest.findMany({ select: { id: true, status: true } }));
    expect(safe.length).toBeGreaterThanOrEqual(2);
  });

  it("a consent record must name the quote request's company", async () => {
    await expect(
      owner.consentRecord.create({
        data: {
          quoteRequestId: ids.quoteA,
          companyId: ids.companyB,
          policyVersion: "t1",
          consentTextHash: "x",
          locale: "en",
          acceptedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/must match/);
  });

  it("a quote request cannot pair one company with another's package", async () => {
    await expect(owner.quoteRequest.create({ data: quoteData(ids.companyA, ids.pkgB) })).rejects.toThrow(
      /same company/,
    );
  });
});

describe("public pages", () => {
  it("visitors see only live packages", async () => {
    const pkgs = await asPublic((tx) => tx.package.findMany({ select: { status: true } }));
    expect(pkgs.every((p) => p.status === "LIVE")).toBe(true);
  });

  it("visitors cannot read licence numbers", async () => {
    await expect(asPublic((tx) => tx.company.findMany())).rejects.toThrow(/permission denied/);
    const safe = await asPublic((tx) => tx.company.findMany({ select: { id: true, name: true } }));
    expect(safe.length).toBeGreaterThanOrEqual(2);
  });
});

describe("audit log is append-only", () => {
  it("app roles can add entries but not change or delete them", async () => {
    const entry = await asA((tx) =>
      tx.auditLog.create({ data: { actorRole: "company", action: "test", targetType: "package" }, select: { id: true } }),
    );
    await expect(asAdmin((tx) => tx.auditLog.update({ where: { id: entry.id }, data: { action: "x" } }))).rejects.toThrow();
    await expect(asAdmin((tx) => tx.auditLog.deleteMany())).rejects.toThrow();
  });

  it("companies and visitors cannot read the audit log", async () => {
    await expect(asA((tx) => tx.auditLog.findMany())).rejects.toThrow(/permission denied/);
    await expect(asPublic((tx) => tx.auditLog.findMany())).rejects.toThrow(/permission denied/);
  });

  it("even the table owner cannot change or delete entries", async () => {
    const entry = await owner.auditLog.create({ data: { actorRole: "system", action: "test", targetType: "x" } });
    await expect(owner.auditLog.update({ where: { id: entry.id }, data: { action: "y" } })).rejects.toThrow(
      /append-only/,
    );
    await expect(owner.$executeRawUnsafe("TRUNCATE audit_log")).rejects.toThrow(/append-only/);
  });
});
