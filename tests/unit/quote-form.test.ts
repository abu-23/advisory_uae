import { describe, expect, it } from "vitest";
import { quoteFormSchema } from "@/lib/quote-form";
import { checkLimits, MemoryRateLimiter } from "@/server/ratelimit/ratelimit";

const base = { packageId: "11111111-1111-4111-8111-111111111111", name: "Test Person", consent: "yes" };

describe("quote form", () => {
  it("accepts an email and lower-cases it", () => {
    const r = quoteFormSchema.parse({ ...base, contact: " Name@Example.com " });
    expect(r.contact).toEqual({ type: "EMAIL", value: "name@example.com" });
  });

  it("accepts a phone number and keeps only digits and +", () => {
    const r = quoteFormSchema.parse({ ...base, contact: "+971 50 000 0000" });
    expect(r.contact).toEqual({ type: "PHONE", value: "+971500000000" });
  });

  it("rejects anything that is neither", () => {
    for (const contact of ["hello", "12", "name@", "+971 50 000 0000 / name@example.com"]) {
      expect(quoteFormSchema.safeParse({ ...base, contact }).success).toBe(false);
    }
  });

  it("requires consent", () => {
    expect(quoteFormSchema.safeParse({ ...base, contact: "a@example.com", consent: undefined }).success).toBe(false);
  });

  it("rejects a filled honeypot", () => {
    expect(quoteFormSchema.safeParse({ ...base, contact: "a@example.com", website: "spam" }).success).toBe(false);
  });

  it("rejects extra fields such as passport or Emirates ID", () => {
    expect(quoteFormSchema.safeParse({ ...base, contact: "a@example.com", passport: "X1" }).success).toBe(false);
  });

  it("rejects markup in the name", () => {
    expect(quoteFormSchema.safeParse({ ...base, name: "<script>", contact: "a@example.com" }).success).toBe(false);
  });
});

describe("rate limits", () => {
  it("blocks after the limit and keeps subjects separate", async () => {
    const limiter = new MemoryRateLimiter();
    const limits = [{ name: "t", max: 2, windowSeconds: 60 }];
    expect(await checkLimits(limiter, limits, "a")).toBe(true);
    expect(await checkLimits(limiter, limits, "a")).toBe(true);
    expect(await checkLimits(limiter, limits, "a")).toBe(false);
    expect(await checkLimits(limiter, limits, "b")).toBe(true);
  });
});
