/**
 * Contact details are released to a company only with a stored, unwithdrawn
 * consent for that company. Every attempt is audited, without personal data.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contactContext, encryptField, LocalKeyProvider } from "@/server/crypto/field-encryption";
import { revealContact } from "@/server/data/contact";
import { createClient } from "@/server/data/db";
import type { PrismaClient } from "@/generated/prisma/client";

const keys = new LocalKeyProvider(randomBytes(32).toString("base64"));
const NAME = "Test Person (sample)";
const EMAIL = "person@example.com";
const actorId = randomUUID();

let owner: PrismaClient;
let app: PrismaClient;
let companyA: string;
let companyB: string;
let pkgA: string;

async function makeQuote(opts: { consent: boolean; withdrawn?: boolean }) {
  const id = randomUUID();
  await owner.quoteRequest.create({
    data: {
      id,
      companyId: companyA,
      packageId: pkgA,
      answers: {},
      contactNameEnc: new Uint8Array(await encryptField(keys, NAME, contactContext.name(id))),
      contactValueEnc: new Uint8Array(await encryptField(keys, EMAIL, contactContext.value(id))),
      contactType: "EMAIL",
      keyId: keys.keyId,
      deleteAfter: new Date(Date.now() + 365 * 864e5),
    },
  });
  if (opts.consent) {
    await owner.consentRecord.create({
      data: {
        quoteRequestId: id,
        companyId: companyA,
        policyVersion: "c1",
        consentTextHash: "hash",
        locale: "en",
        acceptedAt: new Date(),
        withdrawnAt: opts.withdrawn ? new Date() : null,
      },
    });
  }
  return id;
}

const reveal = (companyId: string, quoteRequestId: string) =>
  revealContact({ companyId, actorId, quoteRequestId }, { client: app, keys });

beforeAll(async () => {
  owner = createClient(process.env.TEST_OWNER_DATABASE_URL!);
  app = createClient(process.env.TEST_APP_DATABASE_URL!);
  companyA = (await owner.company.create({ data: { slug: "ca-sample", name: "CA (sample)", isSample: true } })).id;
  companyB = (await owner.company.create({ data: { slug: "cb-sample", name: "CB (sample)", isSample: true } })).id;
  pkgA = (
    await owner.package.create({
      data: {
        companyId: companyA,
        serviceTypes: ["EJARI"],
        titleEn: "t",
        titleAr: "t",
        govFeesFils: 0,
        serviceFeeFils: 100,
        turnaroundDaysMin: 1,
        turnaroundDaysMax: 1,
        priceUpdatedAt: new Date(),
        status: "LIVE",
      },
    })
  ).id;
  await owner.policyVersion.create({ data: { version: "c1", textEn: "t", textAr: "t", publishedAt: new Date() } });
});

afterAll(async () => {
  await owner?.$disconnect();
  await app?.$disconnect();
});

describe("revealContact", () => {
  it("returns the contact when the company has consent", async () => {
    const id = await makeQuote({ consent: true });
    expect(await reveal(companyA, id)).toEqual({ name: NAME, value: EMAIL, type: "EMAIL" });
  });

  it("returns nothing without a consent record", async () => {
    expect(await reveal(companyA, await makeQuote({ consent: false }))).toBeNull();
  });

  it("returns nothing after consent is withdrawn", async () => {
    expect(await reveal(companyA, await makeQuote({ consent: true, withdrawn: true }))).toBeNull();
  });

  it("returns nothing to another company, even with the right request id", async () => {
    expect(await reveal(companyB, await makeQuote({ consent: true }))).toBeNull();
  });

  it("audits every attempt, allowed and denied", async () => {
    const id = await makeQuote({ consent: true });
    await reveal(companyA, id);
    await reveal(companyB, id);
    const entries = await owner.auditLog.findMany({ where: { targetId: id }, orderBy: { id: "asc" } });
    expect(entries.map((e) => e.action)).toEqual(["contact.reveal", "contact.reveal_denied"]);
    expect(entries.every((e) => e.actorId === actorId)).toBe(true);
  });

  it("never stores personal data in the audit log or in plaintext columns", async () => {
    const dump = JSON.stringify(
      await owner.$queryRawUnsafe(`SELECT row_to_json(a)::text AS r FROM audit_log a`),
    );
    expect(dump).not.toContain(EMAIL);
    expect(dump).not.toContain(NAME);
    const quotes = await owner.$queryRawUnsafe<{ r: string }[]>(
      `SELECT encode(contact_name_enc, 'escape') || encode(contact_value_enc, 'escape') AS r FROM quote_request`,
    );
    expect(quotes.some((q) => q.r.includes(EMAIL) || q.r.includes(NAME))).toBe(false);
  });
});
