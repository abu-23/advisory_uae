import { z } from "zod";
import { writeAudit } from "@/server/audit/audit";
import { revealContact } from "@/server/data/contact";
import { withDb } from "@/server/data/db";
import { HttpError, requireCompany, type Actor } from "@/server/policy/actor";
import type { KeyProvider } from "@/server/crypto/field-encryption";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Company endpoints. The company always comes from the session, never from the request.
 * Row-level security repeats the same rule in the database.
 */

export type ApiResult = { status: number; body: unknown };
type Deps = { client?: PrismaClient; keys?: KeyProvider; now?: Date };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The only fields a company may change on a package. Anything else is rejected. */
export const packageUpdateSchema = z
  .object({
    serviceFeeFils: z.number().int().min(0).max(100_000_000),
    renewalFeeFils: z.number().int().min(0).max(100_000_000).nullable(),
    renewalPeriodMonths: z.number().int().min(1).max(60).nullable(),
    turnaroundDaysMin: z.number().int().min(1).max(365),
    turnaroundDaysMax: z.number().int().min(1).max(365),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "empty")
  .refine((v) => v.turnaroundDaysMin === undefined || v.turnaroundDaysMax === undefined || v.turnaroundDaysMax >= v.turnaroundDaysMin, "range");

export async function listOwnPackages(actor: Actor, deps: Deps = {}): Promise<ApiResult> {
  const { companyId } = requireCompany(actor);
  const packages = await withDb(
    { role: "company", companyId },
    (tx) =>
      tx.package.findMany({
        where: { companyId },
        select: {
          id: true,
          titleEn: true,
          status: true,
          govFeesFils: true,
          serviceFeeFils: true,
          renewalFeeFils: true,
          priceUpdatedAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    deps.client,
  );
  return { status: 200, body: { packages } };
}

export async function updateOwnPackage(actor: Actor, packageId: string, raw: unknown, deps: Deps = {}): Promise<ApiResult> {
  const { companyId, userId } = requireCompany(actor);
  if (!UUID.test(packageId)) throw new HttpError(404, "Not found");
  const parsed = packageUpdateSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Invalid request");

  const updated = await withDb(
    { role: "company", companyId },
    async (tx) => {
      // Scoped by company twice: here, and by row-level security.
      const result = await tx.package.updateMany({
        where: { id: packageId, companyId },
        data: { ...parsed.data, priceUpdatedAt: deps.now ?? new Date() },
      });
      if (result.count === 0) return false;
      await writeAudit(tx, {
        actorId: userId,
        actorRole: "company",
        action: "package.update",
        targetType: "package",
        targetId: packageId,
      });
      return true;
    },
    deps.client,
  );
  if (!updated) throw new HttpError(404, "Not found");
  return { status: 200, body: { ok: true } };
}

/** Quote requests for this company. Never includes contact details. */
export async function listOwnQuotes(actor: Actor, deps: Deps = {}): Promise<ApiResult> {
  const { companyId } = requireCompany(actor);
  const quotes = await withDb(
    { role: "company", companyId },
    (tx) =>
      tx.quoteRequest.findMany({
        where: { companyId },
        select: { id: true, status: true, createdAt: true, answers: true, consent: { select: { withdrawnAt: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    deps.client,
  );
  return {
    status: 200,
    body: {
      quotes: quotes.map((q) => ({
        id: q.id,
        status: q.status,
        createdAt: q.createdAt,
        answers: q.answers,
        contactAvailable: q.consent !== null && q.consent.withdrawnAt === null,
      })),
    },
  };
}

/** Contact details, only with a stored consent for this company. Every attempt is audited. */
export async function getQuoteContact(actor: Actor, quoteId: string, requestId: string | undefined, deps: Deps = {}): Promise<ApiResult> {
  const { companyId, userId } = requireCompany(actor);
  if (!UUID.test(quoteId)) throw new HttpError(404, "Not found");
  const contact = await revealContact(
    { companyId, actorId: userId, quoteRequestId: quoteId, requestId },
    { client: deps.client, keys: deps.keys },
  );
  // Same answer whether the request doesn't exist, belongs to someone else, or has no consent.
  if (!contact) throw new HttpError(404, "Not found");
  return { status: 200, body: { contact } };
}
