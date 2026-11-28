import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redisAuthStorage, RedisRateLimiter, usesSharedStore } from "@/server/ratelimit/ratelimit";

describe("which store is used", () => {
  it("uses shared storage for built apps and staging/production only", () => {
    expect(usesSharedStore({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false);
    expect(usesSharedStore({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false);
    expect(usesSharedStore({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
    expect(usesSharedStore({ NODE_ENV: "development", APP_ENV: "staging" } as NodeJS.ProcessEnv)).toBe(true);
    expect(usesSharedStore({ NODE_ENV: "development", APP_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe.runIf(process.env.REDIS_TEST_URL)("shared (Redis) rate limits across two servers", () => {
  let serverA: RedisClientType;
  let serverB: RedisClientType;
  beforeAll(async () => {
    serverA = createClient({ url: process.env.REDIS_TEST_URL });
    serverB = createClient({ url: process.env.REDIS_TEST_URL });
    await Promise.all([serverA.connect(), serverB.connect()]);
  });
  afterAll(async () => {
    await Promise.all([serverA?.quit(), serverB?.quit()]);
  });

  it("sign-in limit counts hits from both servers together", async () => {
    const a = redisAuthStorage(serverA);
    const b = redisAuthStorage(serverB);
    const key = `203.0.113.7|/sign-in/email|${randomUUID()}`;
    const rule = { window: 60, max: 5 };
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await a.consume(key, rule));
    results.push(await b.consume(key, rule)); // 5th, allowed
    const sixth = await b.consume(key, rule); // blocked, even though a different server
    expect(results.every((r) => r.allowed)).toBe(true);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfter).toBeGreaterThan(0);
    expect(sixth.retryAfter).toBeLessThanOrEqual(60);
  });

  it("simultaneous requests cannot slip past the limit", async () => {
    const storage = redisAuthStorage(serverA);
    const key = `203.0.113.8|/two-factor/verify-totp|${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 30 }, () => storage.consume(key, { window: 60, max: 5 })));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("every key has an expiry and the raw address is never stored", async () => {
    const storage = redisAuthStorage(serverA);
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    await storage.consume(`${ip}|/sign-in/email`, { window: 120, max: 5 });
    const keys = await serverA.keys("rl:auth:*");
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some((k) => k.includes(ip))).toBe(false);
    for (const k of keys) expect(await serverA.ttl(k)).toBeGreaterThan(0);
  });

  it("quote limiter also counts across servers", async () => {
    const limits = { name: `shared-${randomUUID()}`, max: 2, windowSeconds: 60 };
    const a = new RedisRateLimiter(serverA);
    const b = new RedisRateLimiter(serverB);
    expect((await a.hit(limits, "x")).allowed).toBe(true);
    expect((await b.hit(limits, "x")).allowed).toBe(true);
    expect((await a.hit(limits, "x")).allowed).toBe(false);
  });
});
