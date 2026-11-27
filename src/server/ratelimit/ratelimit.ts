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

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: RedisClientType) {}

  async hit(limit: Limit, subject: string): Promise<LimitResult> {
    const key = keyFor(limit, subject);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, limit.windowSeconds);
    return { allowed: count <= limit.max, remaining: Math.max(0, limit.max - count) };
  }
}

/** Checks every limit; blocked if any is exceeded. */
export async function checkLimits(limiter: RateLimiter, limits: Limit[], subject: string): Promise<boolean> {
  const results = await Promise.all(limits.map((l) => limiter.hit(l, subject)));
  return results.every((r) => r.allowed);
}

let shared: RateLimiter | undefined;

export async function rateLimiter(): Promise<RateLimiter> {
  if (shared) return shared;
  if (process.env.NODE_ENV === "production") {
    const client: RedisClientType = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    shared = new RedisRateLimiter(client);
  } else {
    shared = new MemoryRateLimiter();
  }
  return shared;
}
