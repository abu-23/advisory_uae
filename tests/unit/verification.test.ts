import { describe, expect, it } from "vitest";
import { isVerified, verificationExpiresAt } from "@/server/domain/verification";

const day = 864e5;
const now = new Date("2026-11-27T12:00:00Z");

describe("Verified rule", () => {
  it("no record means Unverified", () => {
    expect(isVerified(null, now)).toBe(false);
  });

  it("a recent check with a valid licence is Verified", () => {
    expect(isVerified({ status: "VERIFIED", checkedAt: new Date(+now - 10 * day), licenceExpiresAt: new Date(+now + 100 * day) }, now)).toBe(true);
  });

  it("expires when the licence expires, if that comes first", () => {
    const v = { status: "VERIFIED" as const, checkedAt: new Date(+now - 10 * day), licenceExpiresAt: new Date(+now - day) };
    expect(isVerified(v, now)).toBe(false);
    expect(verificationExpiresAt(v)).toEqual(v.licenceExpiresAt);
  });

  it("expires 12 months after the check, if that comes first", () => {
    const v = { status: "VERIFIED" as const, checkedAt: new Date("2025-11-20T00:00:00Z"), licenceExpiresAt: new Date("2028-01-01T00:00:00Z") };
    expect(verificationExpiresAt(v)).toEqual(new Date("2026-11-20T00:00:00Z"));
    expect(isVerified(v, now)).toBe(false);
  });

  it("revoked or rejected is never Verified", () => {
    for (const status of ["REVOKED", "REJECTED"] as const) {
      expect(isVerified({ status, checkedAt: now, licenceExpiresAt: new Date(+now + 100 * day) }, now)).toBe(false);
    }
  });
});
