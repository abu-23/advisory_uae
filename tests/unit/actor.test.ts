import { describe, expect, it } from "vitest";
import { actorFromSession, HttpError, requireAdmin, requireCompany, requireSuperadmin, type Actor } from "@/server/policy/actor";
import { assertSameOrigin } from "@/server/api/http";

const now = new Date("2026-11-27T12:00:00Z");
const U1 = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const mins = (n: number) => new Date(now.getTime() - n * 60_000);
const session = (over: Partial<{ updatedAt: Date; expiresAt: Date }> = {}) => ({
  updatedAt: mins(1),
  expiresAt: new Date(now.getTime() + 3600_000),
  ...over,
});

describe("who is making the request", () => {
  it("no session means visitor", () => {
    expect(actorFromSession(null, now)).toEqual({ kind: "visitor" });
  });

  it("signed in without an authenticator app can only finish setting it up", () => {
    for (const role of ["company", "admin", "superadmin"]) {
      const user = { id: U1, role, companyId: role === "company" ? C1 : null, twoFactorEnabled: false };
      expect(actorFromSession({ user, session: session() }, now)).toEqual({ kind: "mfa_required", userId: U1 });
    }
  });

  it("company user with MFA gets their company from the session", () => {
    const user = { id: U1, role: "company", companyId: C1, twoFactorEnabled: true };
    expect(actorFromSession({ user, session: session() }, now)).toEqual({ kind: "company", userId: U1, companyId: C1 });
  });

  it("admins and superadmins with MFA", () => {
    for (const role of ["admin", "superadmin"] as const) {
      const user = { id: U1, role, companyId: null, twoFactorEnabled: true };
      expect(actorFromSession({ user, session: session() }, now)).toEqual({ kind: role, userId: U1 });
    }
  });

  it("expired sessions are visitors", () => {
    const user = { id: U1, role: "company", companyId: C1, twoFactorEnabled: true };
    expect(actorFromSession({ user, session: session({ expiresAt: mins(1) }) }, now)).toEqual({ kind: "visitor" });
  });

  it("admins are signed out after 30 minutes idle, company users are not", () => {
    const admin = { id: U1, role: "admin", companyId: null, twoFactorEnabled: true };
    expect(actorFromSession({ user: admin, session: session({ updatedAt: mins(29) }) }, now)).toMatchObject({ kind: "admin" });
    expect(actorFromSession({ user: admin, session: session({ updatedAt: mins(31) }) }, now)).toEqual({ kind: "visitor" });
    const company = { id: U1, role: "company", companyId: C1, twoFactorEnabled: true };
    expect(actorFromSession({ user: company, session: session({ updatedAt: mins(120) }) }, now)).toMatchObject({ kind: "company" });
  });

  it("anything odd is a visitor", () => {
    const bad = [
      { id: U1, role: "root", companyId: null, twoFactorEnabled: true },
      { id: U1, role: "company", companyId: null, twoFactorEnabled: true },
      { id: U1, role: "company", companyId: "not-a-uuid", twoFactorEnabled: true },
      { id: U1, role: "admin", companyId: C1, twoFactorEnabled: true },
      { id: "nope", role: "admin", companyId: null, twoFactorEnabled: true },
    ];
    for (const user of bad) expect(actorFromSession({ user, session: session() }, now)).toEqual({ kind: "visitor" });
  });
});

const status = (fn: () => unknown) => {
  try {
    fn();
    return 200;
  } catch (e) {
    return e instanceof HttpError ? e.status : 500;
  }
};
const actors: Record<string, Actor> = {
  visitor: { kind: "visitor" },
  mfa: { kind: "mfa_required", userId: U1 },
  company: { kind: "company", userId: U1, companyId: C1 },
  admin: { kind: "admin", userId: U1 },
  superadmin: { kind: "superadmin", userId: U1 },
};

describe("role checks", () => {
  it("company endpoints", () => {
    expect(Object.fromEntries(Object.entries(actors).map(([k, a]) => [k, status(() => requireCompany(a))]))).toEqual({
      visitor: 401, mfa: 401, company: 200, admin: 403, superadmin: 403,
    });
  });
  it("admin endpoints", () => {
    expect(Object.fromEntries(Object.entries(actors).map(([k, a]) => [k, status(() => requireAdmin(a))]))).toEqual({
      visitor: 401, mfa: 401, company: 403, admin: 200, superadmin: 200,
    });
  });
  it("superadmin-only", () => {
    expect(Object.fromEntries(Object.entries(actors).map(([k, a]) => [k, status(() => requireSuperadmin(a))]))).toEqual({
      visitor: 401, mfa: 401, company: 403, admin: 403, superadmin: 200,
    });
  });
});

describe("same-origin rule for writes", () => {
  const app = "https://app.example.com";
  const req = (method: string, headers: Record<string, string> = {}) => new Request(`${app}/api/x`, { method, headers });

  it("reads need nothing", () => expect(status(() => assertSameOrigin(req("GET"), app))).toBe(200));
  it("writes without an Origin header are refused", () => {
    expect(status(() => assertSameOrigin(req("POST", { "content-type": "application/json" }), app))).toBe(403);
  });
  it("writes from another site are refused", () => {
    expect(status(() => assertSameOrigin(req("PATCH", { origin: "https://evil.example", "content-type": "application/json" }), app))).toBe(403);
  });
  it("writes must be JSON", () => {
    expect(status(() => assertSameOrigin(req("POST", { origin: app, "content-type": "application/x-www-form-urlencoded" }), app))).toBe(400);
  });
  it("same-site JSON writes pass", () => {
    expect(status(() => assertSameOrigin(req("POST", { origin: app, "content-type": "application/json" }), app))).toBe(200);
  });
});
