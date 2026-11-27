/** A visitor's quote request: encrypted, consented, audited, and readable only by that one company. */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient as createRedis, type RedisClientType } from "redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalKeyProvider } from "@/server/crypto/field-encryption";
import { revealContact } from "@/server/data/contact";
import { createClient, withDb } from "@/server/data/db";
import { checkLimits, RedisRateLimiter } from "@/server/ratelimit/ratelimit";
import { createQuoteRequest, findQuoteTarget, hashConsentText } from "@/server/quote/submit";
import type { PrismaClient } from "@/generated/prisma/client";

const keys = new LocalKeyProvider(randomBytes(32).toString("base64"));
const EMAIL = "visitor@example.com";
const NAME = "Visitor Person (sample)";
let owner: PrismaClient;
let app: PrismaClient;
let companyA: string;
let companyB: string;
let livePkg: string;
let draftPkg: string;

const answers = { services: ["EJARI" as const], location: "DUBAI_MAINLAND" as const, visas: 0, timing: "WEEK" as const };

beforeAll(async () => {
  owner = createClient(process.env.TEST_OWNER_DATABASE_URL!);
  app = createClient(process.env.TEST_APP_DATABASE_URL!);
  companyA = (await owner.company.create({ data: { slug: "qa-sample", name: "QA (sample)", isSample: true } })).id;
  companyB = (await owner.company.create({ data: { slug: "qb-sample", name: "QB (sample)", isSample: true } })).id;
  const pkg = (status: "LIVE" | "DRAFT") => ({
    companyId: companyA,
    serviceTypes: ["EJARI" as const],
    locations: ["DUBAI_MAINLAND" as const],
    titleEn: "t",
    titleAr: "t",
    govFeesFils: 0,
    serviceFeeFils: 100,
    turnaroundDaysMin: 1,
    turnaroundDaysMax: 1,
    priceUpdatedAt: new Date(),
    status,
  });
  livePkg = (await owner.package.create({ data: pkg("LIVE") })).id;
  draftPkg = (await owner.package.create({ data: pkg("DRAFT") })).id;
  await owner.policyVersion.upsert({
    where: { version: "q1" },
    update: {},
    create: { version: "q1", textEn: "t", textAr: "t", publishedAt: new Date(Date.now() - 1000) },
  });
});

afterAll(async () => {
  await owner?.$disconnect();
  await app?.$disconnect();
});

async function submit() {
  const target = await findQuoteTarget(livePkg, app);
  expect(target).not.toBeNull();
  return createQuoteRequest(
    {
      form: { packageId: livePkg, name: NAME, contact: { type: "EMAIL", value: EMAIL }, consent: "yes", website: "" },
      answers,
      target: target!,
      consentText: "I agree to share these details with QA (sample) only",
      locale: "en",
    },
    { client: app, keys },
  );
}

describe("quote requests", () => {
  it("only live packages can be quoted", async () => {
    expect(await findQuoteTarget(draftPkg, app)).toBeNull();
    expect(await findQuoteTarget(randomUUID(), app)).toBeNull();
  });

  it("stores contact details encrypted, with consent and 12-month retention", async () => {
    const { id } = await submit();
    const q = await owner.quoteRequest.findUniqueOrThrow({ where: { id }, include: { consent: true } });
    expect(Buffer.from(q.contactValueEnc).toString("latin1")).not.toContain(EMAIL);
    expect(q.consent?.companyId).toBe(companyA);
    expect(q.consent?.consentTextHash).toBe(hashConsentText("I agree to share these details with QA (sample) only"));
    const months = (q.deleteAfter.getTime() - q.createdAt.getTime()) / (30.4 * 864e5);
    expect(months).toBeGreaterThan(11.9);
    expect(months).toBeLessThan(12.2);
  });

  it("the visitor role cannot read it back", async () => {
    await expect(withDb({ role: "public" }, (tx) => tx.quoteRequest.findMany({ select: { id: true } }), app)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("the chosen company can read the contact; another company cannot", async () => {
    const { id } = await submit();
    const actorId = randomUUID();
    expect(await revealContact({ companyId: companyA, actorId, quoteRequestId: id }, { client: app, keys })).toEqual({
      name: NAME,
      value: EMAIL,
      type: "EMAIL",
    });
    expect(await revealContact({ companyId: companyB, actorId, quoteRequestId: id }, { client: app, keys })).toBeNull();
  });

  it("is audited without personal data", async () => {
    const { id } = await submit();
    const found = await owner.auditLog.findFirstOrThrow({ where: { targetId: id, action: "quote.create" } });
    const entry = { ...found, id: String(found.id) };
    expect(JSON.stringify(entry)).not.toContain(EMAIL);
    expect(JSON.stringify(entry)).not.toContain(NAME);
  });
});

describe.runIf(process.env.REDIS_TEST_URL)("Redis rate limiter", () => {
  let redis: RedisClientType;
  beforeAll(async () => {
    redis = createRedis({ url: process.env.REDIS_TEST_URL });
    await redis.connect();
  });
  afterAll(async () => {
    await redis?.quit();
  });

  it("blocks after the limit and never stores the raw subject", async () => {
    const limiter = new RedisRateLimiter(redis);
    const subject = `203.0.113.${Math.floor(Math.random() * 200)}`;
    const limits = [{ name: `test-${randomUUID()}`, max: 2, windowSeconds: 60 }];
    expect(await checkLimits(limiter, limits, subject)).toBe(true);
    expect(await checkLimits(limiter, limits, subject)).toBe(true);
    expect(await checkLimits(limiter, limits, subject)).toBe(false);
    const keysFound = await redis.keys("rl:*");
    expect(keysFound.some((k) => k.includes(subject))).toBe(false);
  });
});
