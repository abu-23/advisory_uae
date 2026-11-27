import { describe, expect, it } from "vitest";
import { loadEnv } from "@/server/env";

const key = Buffer.alloc(32, 7).toString("base64");
const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://app:devpass@localhost:5432/advisr",
  AUTH_DATABASE_URL: "postgresql://auth:devpass@localhost:5432/advisr",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "x".repeat(40),
  AUTH_URL: "http://localhost:3000",
  FIELD_ENCRYPTION_KEY: key,
};

describe("loadEnv", () => {
  it("accepts a valid development config", () => {
    expect(loadEnv(valid).NODE_ENV).toBe("development");
  });

  it("rejects missing required values", () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("rejects placeholder values copied from .env.example", () => {
    expect(() => loadEnv({ ...valid, SESSION_SECRET: "REPLACE_WITH_LONG_RANDOM_VALUE" })).toThrow(/placeholder/);
    expect(() => loadEnv({ ...valid, DATABASE_URL: "postgresql://USER:PASSWORD@HOST:5432/DBNAME" })).toThrow(
      /placeholder/,
    );
  });

  it("rejects a short session secret", () => {
    expect(() => loadEnv({ ...valid, SESSION_SECRET: "short" })).toThrow(/32 characters/);
  });

  it("rejects an encryption key that is not 32 bytes", () => {
    expect(() => loadEnv({ ...valid, FIELD_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(
      /32 random bytes/,
    );
  });

  it("requires https in staging and production", () => {
    expect(() => loadEnv({ ...valid, APP_ENV: "production" })).toThrow(/https/);
    expect(() => loadEnv({ ...valid, APP_ENV: "staging" })).toThrow(/https/);
    expect(loadEnv({ ...valid, APP_ENV: "production", AUTH_URL: "https://example.com" }).APP_ENV).toBe("production");
    // An optimised build on a laptop or in CI is not production.
    expect(loadEnv({ ...valid, NODE_ENV: "production" }).APP_ENV).toBe("development");
  });

  it("never puts secret values in the error message", () => {
    const secret = "REPLACE_WITH_" + "s".repeat(40);
    try {
      loadEnv({ ...valid, SESSION_SECRET: secret });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain(secret);
    }
  });
});
