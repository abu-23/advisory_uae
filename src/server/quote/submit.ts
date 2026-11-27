import { createHash, randomUUID } from "node:crypto";
import type { Answers } from "@/lib/filters";
import type { QuoteForm } from "@/lib/quote-form";
import { writeAudit } from "@/server/audit/audit";
import { contactContext, encryptField, keyProvider, type KeyProvider } from "@/server/crypto/field-encryption";
import { withDb } from "@/server/data/db";
import type { PrismaClient } from "@/generated/prisma/client";

/** Default retention for quote requests: 12 months, pending legal review. */
export const QUOTE_RETENTION_MONTHS = 12;

export const hashConsentText = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export type QuoteTarget = { packageId: string; companyId: string; companyName: string; companySlug: string };

/** The package must be live and visible to visitors. */
export async function findQuoteTarget(packageId: string, client?: PrismaClient): Promise<QuoteTarget | null> {
  return withDb(
    { role: "public" },
    async (tx) => {
      const p = await tx.package.findUnique({
        where: { id: packageId },
        select: { id: true, status: true, company: { select: { id: true, name: true, slug: true } } },
      });
      if (!p || p.status !== "LIVE") return null;
      return { packageId: p.id, companyId: p.company.id, companyName: p.company.name, companySlug: p.company.slug };
    },
    client,
  );
}

/**
 * Stores a quote request with encrypted contact details and a consent record
 * naming the one company. Runs as the visitor role, which can insert but never read.
 */
export async function createQuoteRequest(
  input: { form: QuoteForm; answers: Answers; target: QuoteTarget; consentText: string; locale: "en" | "ar" },
  deps: { client?: PrismaClient; keys?: KeyProvider; now?: Date } = {},
): Promise<{ id: string }> {
  const keys = deps.keys ?? keyProvider();
  const now = deps.now ?? new Date();
  const id = randomUUID();
  const deleteAfter = new Date(now);
  deleteAfter.setUTCMonth(deleteAfter.getUTCMonth() + QUOTE_RETENTION_MONTHS);

  const [nameEnc, valueEnc] = await Promise.all([
    encryptField(keys, input.form.name, contactContext.name(id)),
    encryptField(keys, input.form.contact.value, contactContext.value(id)),
  ]);

  await withDb(
    { role: "public" },
    async (tx) => {
      const policy = await tx.policyVersion.findFirst({
        where: { publishedAt: { lte: now } },
        orderBy: { publishedAt: "desc" },
        select: { version: true },
      });
      if (!policy) throw new Error("No published consent policy");

      // createMany: no RETURNING, because visitors may not read quote requests back.
      await tx.quoteRequest.createMany({
        data: [
          {
            id,
            companyId: input.target.companyId,
            packageId: input.target.packageId,
            answers: input.answers,
            contactNameEnc: new Uint8Array(nameEnc),
            contactValueEnc: new Uint8Array(valueEnc),
            contactType: input.form.contact.type,
            keyId: keys.keyId,
            status: "NEW",
            createdAt: now,
            deleteAfter,
          },
        ],
      });
      await tx.consentRecord.createMany({
        data: [
          {
            quoteRequestId: id,
            companyId: input.target.companyId,
            policyVersion: policy.version,
            consentTextHash: hashConsentText(input.consentText),
            locale: input.locale,
            acceptedAt: now,
          },
        ],
      });
      await writeAudit(tx, {
        actorId: null,
        actorRole: "visitor",
        action: "quote.create",
        targetType: "quote_request",
        targetId: id,
        metadata: { contact_type: input.form.contact.type, policy: policy.version },
      });
    },
    deps.client,
  );

  return { id };
}
