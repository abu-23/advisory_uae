import { createHash } from "node:crypto";
import { createClient, type RedisClientType } from "redis";

/**
 * Fixed-window rate limits. Redis in production (shared across servers);
 * in-memory for development and tests. Keys are hashed, so raw IP addresses
 * are never stored.
 */

export type Limit = { name: string; max: number; windowSeconds: number };
export type LimitResult = { allowed: boolean; remaining: number };

export interface RateLimiter {
  hit(limit: Limit, subject: string): Promise<LimitResult>;
}

export const QUOTE_LIMITS: Limit[] = [
  { name: "quote:10m", max: 5, windowSeconds: 600 },
  { name: "quote:day", max: 20, windowSeconds: 86_400 },
];

const keyFor = (limit: Limit, subject: string) =>
  `rl:${limit.name}:${createHash("sha256").update(`${limit.name}:${subject}`).digest("hex").slice(0, 32)}`;

export class MemoryRateLimiter implements RateLimiter {
  #hits = new Map<string, { count: number; resetAt: number }>();

  async hit(limit: Limit, subject: string): Promise<LimitResult> {
    const key = keyFor(limit, subject);
    const now = Date.now();
    const entry = this.#hits.get(key);
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + limit.windowSeconds * 1000 };
    current.count += 1;
    this.#hits.set(key, current);
    return { allowed: current.count <= limit.max, remaining: Math.max(0, limit.max - current.count) };
  }
}

/**
 * Count one hit and set the expiry in one step, so a crash between the two can
 * never leave a key that lives forever. Returns {count, secondsLeft}.
 */
const HIT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if c == 1 or ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {c, ttl}
`;

async function redisHit(redis: RedisClientType, key: string, windowSeconds: number): Promise<{ count: number; secondsLeft: number }> {
  const res = (await redis.eval(HIT_SCRIPT, { keys: [key], arguments: [String(windowSeconds)] })) as [number, number];
  return { count: Number(res[0]), secondsLeft: Number(res[1]) };
}

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: RedisClientType) {}

  async hit(limit: Limit, subject: string): Promise<LimitResult> {
    const { count } = await redisHit(this.redis, keyFor(limit, subject), limit.windowSeconds);
    return { allowed: count <= limit.max, remaining: Math.max(0, limit.max - count) };
  }
}

/** The shape Better Auth expects for its own sign-in limits. */
export type AuthRateLimitStorage = {
  consume(key: string, rule: { window: number; max: number }): Promise<{ allowed: boolean; retryAfter: number | null }>;
};

/** Keys are hashed, so raw IP addresses are never stored. Fails closed: if Redis is down the request errors. */
export function redisAuthStorage(redis: RedisClientType): AuthRateLimitStorage {
  return {
    async consume(key, rule) {
      const hashed = `rl:auth:${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
      const { count, secondsLeft } = await redisHit(redis, hashed, rule.window);
      return count <= rule.max ? { allowed: true, retryAfter: null } : { allowed: false, retryAfter: Math.max(1, secondsLeft) };
    },
  };
}

/** Shared (Redis) storage is used for built apps and staging/production; dev server and unit tests use memory. */
export function usesSharedStore(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.APP_ENV === "production" || env.APP_ENV === "staging";
}

let redisClient: Promise<RedisClientType> | undefined;

export function sharedRedis(): Promise<RedisClientType> {
  redisClient ??= (async () => {
    const client: RedisClientType = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => {
      // Errors surface on each command; this keeps one dropped connection from crashing the process.
    });
    await client.connect();
    return client;
  })().catch((e) => {
    redisClient = undefined;
    throw e;
  });
  return redisClient;
}

/** Checks every limit; blocked if any is exceeded. */
export async function checkLimits(limiter: RateLimiter, limits: Limit[], subject: string): Promise<boolean> {
  const results = await Promise.all(limits.map((l) => limiter.hit(l, subject)));
  return results.every((r) => r.allowed);
}

let shared: RateLimiter | undefined;

export async function rateLimiter(): Promise<RateLimiter> {
  if (shared) return shared;
  shared = usesSharedStore() ? new RedisRateLimiter(await sharedRedis()) : new MemoryRateLimiter();
  return shared;
}

/** Storage for Better Auth's own limits, or undefined to keep its in-memory default. */
export function authRateLimitStorage(): AuthRateLimitStorage | undefined {
  if (!usesSharedStore()) return undefined;
  return { consume: async (key, rule) => redisAuthStorage(await sharedRedis()).consume(key, rule) };
}
