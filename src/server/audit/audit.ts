import { z } from "zod";
import type { Tx } from "@/server/data/db";

/**
 * The only way the app writes to the audit log.
 * Entries hold who did what to which record. Never personal data, never secrets:
 * metadata accepts only short codes, numbers and booleans, and rejects anything
 * that looks like an email address or phone number.
 */

export const AUDIT_ACTIONS = [
  "quote.create",
  "contact.reveal",
  "contact.reveal_denied",
  "verification.set",
  "verification.revoke",
  "review.moderate",
  "company.create",
  "company.update",
  "package.update",
  "admin.manage",
  "auth.sign_in",
  "auth.sign_in_failed",
  "auth.mfa_enrolled",
  "data.export",
  "data.delete",
] as const;

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /\+?\d[\d\s().-]{6,}\d/;

const safeValue = z.union([
  z.number(),
  z.boolean(),
  z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9_.:-]*$/, "metadata strings must be short codes")
    .refine((s) => !EMAIL.test(s) && !PHONE.test(s), "metadata must not contain personal data"),
]);

export const auditEntrySchema = z
  .object({
    actorId: z.uuid().nullable(),
    actorRole: z.enum(["visitor", "company", "admin", "superadmin", "system"]),
    action: z.enum(AUDIT_ACTIONS),
    targetType: z.string().regex(/^[a-z_]{1,40}$/),
    targetId: z.string().max(64).nullable().optional(),
    requestId: z.string().max(64).nullable().optional(),
    metadata: z.record(z.string().regex(/^[a-zA-Z_]{1,32}$/), safeValue).optional(),
  })
  .strict();

export type AuditEntry = z.input<typeof auditEntrySchema>;

export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  const e = auditEntrySchema.parse(entry);
  await tx.auditLog.create({
    data: {
      actorId: e.actorId,
      actorRole: e.actorRole,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId ?? null,
      requestId: e.requestId ?? null,
      metadata: e.metadata ?? undefined,
    },
    select: { id: true },
  });
}
