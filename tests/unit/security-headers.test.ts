import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce, staticSecurityHeaders } from "@/server/security-headers";

describe("CSP", () => {
  it("is strict in production", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("only allows eval in development", () => {
    expect(buildCsp("abc", true)).toContain("'unsafe-eval'");
  });

  it("uses a different nonce each time", () => {
    expect(generateNonce()).not.toBe(generateNonce());
    expect(Buffer.from(generateNonce(), "base64")).toHaveLength(16);
  });
});

describe("static headers", () => {
  it("sets HSTS in production only", () => {
    expect(staticSecurityHeaders(false)["Strict-Transport-Security"]).toMatch(/max-age=63072000/);
    expect(staticSecurityHeaders(true)["Strict-Transport-Security"]).toBeUndefined();
  });

  it("sets the core headers", () => {
    const h = staticSecurityHeaders(false);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
  });
});
