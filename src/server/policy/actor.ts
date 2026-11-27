/**
 * Who is making this request? One place decides, so every route asks the same question.
 *
 * Rules:
 * - No session, an expired session, or an unknown role: visitor.
 * - Signed in but no authenticator app enrolled: "mfa_required". Can do nothing
 *   except finish enrolling. Company users, admins and superadmins all need MFA.
 * - Admins and superadmins are signed out after 30 minutes without activity.
 * - A company user must belong to exactly one company, taken from the session,
 *   never from the request.
 */

export const ADMIN_IDLE_MS = 30 * 60 * 1000;

export type Actor =
  | { kind: "visitor" }
  | { kind: "mfa_required"; userId: string }
  | { kind: "company"; userId: string; companyId: string }
  | { kind: "admin"; userId: string }
  | { kind: "superadmin"; userId: string };

export type SessionInfo = {
  user: { id: string; role?: unknown; companyId?: unknown; twoFactorEnabled?: unknown };
  session: { updatedAt: Date | string; expiresAt: Date | string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISITOR: Actor = { kind: "visitor" };

export function actorFromSession(info: SessionInfo | null | undefined, now: Date = new Date()): Actor {
  if (!info) return VISITOR;
  const { user, session } = info;
  if (typeof user.id !== "string" || !UUID.test(user.id)) return VISITOR;
  if (new Date(session.expiresAt).getTime() <= now.getTime()) return VISITOR;

  const role = user.role;
  if (role !== "company" && role !== "admin" && role !== "superadmin") return VISITOR;
  if (role === "company" && !(typeof user.companyId === "string" && UUID.test(user.companyId))) return VISITOR;
  if ((role === "admin" || role === "superadmin") && user.companyId) return VISITOR;

  if (role !== "company" && now.getTime() - new Date(session.updatedAt).getTime() > ADMIN_IDLE_MS) return VISITOR;

  if (user.twoFactorEnabled !== true) return { kind: "mfa_required", userId: user.id };

  if (role === "company") return { kind: "company", userId: user.id, companyId: user.companyId as string };
  return { kind: role, userId: user.id };
}

export class HttpError extends Error {
  constructor(
    readonly status: 401 | 403 | 404 | 400 | 429,
    message: string,
  ) {
    super(message);
  }
}

/** 401 when not signed in or MFA is missing. 403 when signed in as the wrong kind of user. */
export function requireCompany(actor: Actor): { userId: string; companyId: string } {
  if (actor.kind === "company") return { userId: actor.userId, companyId: actor.companyId };
  throw deny(actor);
}

export function requireAdmin(actor: Actor): { userId: string; role: "admin" | "superadmin" } {
  if (actor.kind === "admin" || actor.kind === "superadmin") return { userId: actor.userId, role: actor.kind };
  throw deny(actor);
}

export function requireSuperadmin(actor: Actor): { userId: string } {
  if (actor.kind === "superadmin") return { userId: actor.userId };
  throw deny(actor);
}

function deny(actor: Actor): HttpError {
  return actor.kind === "visitor" || actor.kind === "mfa_required"
    ? new HttpError(401, "Sign in with two-step verification first")
    : new HttpError(403, "Not allowed");
}
