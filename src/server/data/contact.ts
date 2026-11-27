import { writeAudit } from "@/server/audit/audit";
import { contactContext, decryptField, keyProvider, type KeyProvider } from "@/server/crypto/field-encryption";
import { withDb } from "@/server/data/db";
import type { PrismaClient } from "@/generated/prisma/client";

export type RevealedContact = { name: string; value: string; type: "PHONE" | "EMAIL" };

/**
 * The only code path that decrypts customer contact details.
 *
 * Returns the contact only if:
 * 1. the quote request belongs to the signed-in company (row-level security), and
 * 2. a consent record for that company exists and has not been withdrawn.
 * Every attempt, allowed or denied, is written to the audit log.
 * Returns null when not allowed; callers show "contact hidden" and never learn why.
 */
export async function revealContact(
  args: { companyId: string; actorId: string; quoteRequestId: string; requestId?: string },
  deps: { client?: PrismaClient; keys?: KeyProvider } = {},
): Promise<RevealedContact | null> {
  const keys = deps.keys ?? keyProvider();

  return withDb(
    { role: "company", companyId: args.companyId },
    async (tx) => {
      const quote = await tx.quoteRequest.findUnique({
        where: { id: args.quoteRequestId },
        select: {
          id: true,
          companyId: true,
          contactNameEnc: true,
          contactValueEnc: true,
          contactType: true,
          consent: { select: { companyId: true, withdrawnAt: true } },
        },
      });

      const allowed =
        quote !== null &&
        quote.companyId === args.companyId &&
        quote.consent !== null &&
        quote.consent.companyId === args.companyId &&
        quote.consent.withdrawnAt === null;

      await writeAudit(tx, {
        actorId: args.actorId,
        actorRole: "company",
        action: allowed ? "contact.reveal" : "contact.reveal_denied",
        targetType: "quote_request",
        targetId: args.quoteRequestId,
        requestId: args.requestId ?? null,
      });

      if (!allowed) return null;

      const [name, value] = await Promise.all([
        decryptField(keys, Buffer.from(quote.contactNameEnc), contactContext.name(quote.id)),
        decryptField(keys, Buffer.from(quote.contactValueEnc), contactContext.value(quote.id)),
      ]);
      return { name, value, type: quote.contactType };
    },
    deps.client,
  );
}
