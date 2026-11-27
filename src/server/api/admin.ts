import { z } from "zod";
import { writeAudit } from "@/server/audit/audit";
import { withDb } from "@/server/data/db";
import { HttpError, requireAdmin, type Actor } from "@/server/policy/actor";
import type { ApiResult } from "./company";
import type { PrismaClient } from "@/generated/prisma/client";

type Deps = { client?: PrismaClient; now?: Date };

/** Verification is set by admins only, server-side. checkedBy always comes from the session. */
export const verificationSchema = z
  .object({
    companyId: z.uuid(),
    status: z.enum(["VERIFIED", "REJECTED", "REVOKED"]),
    checkedAt: z.coerce.date(),
    licenceExpiresAt: z.coerce.date(),
  })
  .strict();

export async function setVerification(actor: Actor, raw: unknown, deps: Deps = {}): Promise<ApiResult> {
  const { userId, role } = requireAdmin(actor);
  const parsed = verificationSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Invalid request");
  const v = parsed.data;
  const now = deps.now ?? new Date();
  if (v.checkedAt.getTime() > now.getTime() + 5 * 60_000) throw new HttpError(400, "Check date is in the future");
  if (v.licenceExpiresAt.getTime() <= v.checkedAt.getTime()) throw new HttpError(400, "Licence must expire after the check");

  const created = await withDb(
    { role: "admin" },
    async (tx) => {
      const company = await tx.company.findUnique({ where: { id: v.companyId }, select: { id: true } });
      if (!company) return null;
      const record = await tx.verificationRecord.create({
        data: { companyId: v.companyId, status: v.status, checkedAt: v.checkedAt, licenceExpiresAt: v.licenceExpiresAt, checkedBy: userId },
        select: { id: true },
      });
      await writeAudit(tx, {
        actorId: userId,
        actorRole: role,
        action: v.status === "VERIFIED" ? "verification.set" : "verification.revoke",
        targetType: "company",
        targetId: v.companyId,
        metadata: { status: v.status },
      });
      return record;
    },
    deps.client,
  );
  if (!created) throw new HttpError(404, "Not found");
  return { status: 201, body: { id: created.id } };
}

export async function listAudit(actor: Actor, deps: Deps = {}): Promise<ApiResult> {
  requireAdmin(actor);
  const rows = await withDb(
    { role: "admin" },
    (tx) =>
      tx.auditLog.findMany({
        orderBy: { id: "desc" },
        take: 100,
        select: { id: true, actorId: true, actorRole: true, action: true, targetType: true, targetId: true, at: true, metadata: true },
      }),
    deps.client,
  );
  return { status: 200, body: { entries: rows.map((r) => ({ ...r, id: String(r.id) })) } };
}
