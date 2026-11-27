import { describe, expect, it } from "vitest";
import { auditEntrySchema } from "@/server/audit/audit";

const base = { actorId: null, actorRole: "system" as const, action: "data.delete" as const, targetType: "quote_request" };

describe("audit entries", () => {
  it("accepts a normal entry", () => {
    expect(auditEntrySchema.parse({ ...base, metadata: { count: 3, reason: "retention_expired" } })).toBeTruthy();
  });

  it("rejects emails and phone numbers in metadata", () => {
    expect(() => auditEntrySchema.parse({ ...base, metadata: { note: "name@example.com" } })).toThrow();
    expect(() => auditEntrySchema.parse({ ...base, metadata: { note: "+971500000000" } })).toThrow();
  });

  it("rejects free text in metadata", () => {
    expect(() => auditEntrySchema.parse({ ...base, metadata: { note: "Ahmed called about his visa" } })).toThrow();
  });

  it("rejects unknown actions and unknown fields", () => {
    expect(() => auditEntrySchema.parse({ ...base, action: "anything" })).toThrow();
    expect(() => auditEntrySchema.parse({ ...base, contact: "x" })).toThrow();
  });
});
