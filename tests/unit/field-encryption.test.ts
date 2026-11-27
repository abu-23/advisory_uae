import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptField, encryptField, LocalKeyProvider } from "@/server/crypto/field-encryption";

const keys = new LocalKeyProvider(randomBytes(32).toString("base64"));
const ctx = "quote_request:11111111-1111-4111-8111-111111111111:contact_value";

describe("field encryption", () => {
  it("round-trips text, including Arabic", async () => {
    for (const text of ["name@example.com", "+971 50 000 0000", "محمد (sample)"]) {
      const blob = await encryptField(keys, text, ctx);
      expect(await decryptField(keys, blob, ctx)).toBe(text);
    }
  });

  it("does not contain the plaintext", async () => {
    const blob = await encryptField(keys, "name@example.com", ctx);
    expect(blob.toString("latin1")).not.toContain("name@example.com");
  });

  it("gives a different ciphertext each time", async () => {
    const a = await encryptField(keys, "same", ctx);
    const b = await encryptField(keys, "same", ctx);
    expect(a.equals(b)).toBe(false);
  });

  it("rejects tampered data", async () => {
    const blob = await encryptField(keys, "name@example.com", ctx);
    const last = blob.length - 1;
    blob[last] = (blob[last] ?? 0) ^ 1;
    await expect(decryptField(keys, blob, ctx)).rejects.toThrow();
  });

  it("rejects a ciphertext moved to another row or field", async () => {
    const blob = await encryptField(keys, "name@example.com", ctx);
    await expect(decryptField(keys, blob, ctx.replace("1111", "2222"))).rejects.toThrow();
    await expect(decryptField(keys, blob, ctx.replace("contact_value", "contact_name"))).rejects.toThrow();
  });

  it("cannot be read with a different master key", async () => {
    const blob = await encryptField(keys, "name@example.com", ctx);
    const other = new LocalKeyProvider(randomBytes(32).toString("base64"));
    await expect(decryptField(other, blob, ctx)).rejects.toThrow();
  });

  it("rejects unknown formats and short keys", async () => {
    await expect(decryptField(keys, Buffer.from([9, 0, 0]), ctx)).rejects.toThrow(/Unsupported/);
    expect(() => new LocalKeyProvider(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
