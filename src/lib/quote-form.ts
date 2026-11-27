import { z } from "zod";

/** Quote form: a name and ONE way to reach the person. Nothing else. */

const PHONE = /^\+?[0-9][0-9 ()-]{6,19}$/;

export const contactSchema = z
  .string()
  .trim()
  .min(5)
  .max(120)
  .transform((v, ctx) => {
    const email = z.email().safeParse(v);
    if (email.success) return { type: "EMAIL" as const, value: email.data.toLowerCase() };
    const digits = v.replace(/\D/g, "");
    if (PHONE.test(v) && digits.length >= 7 && digits.length <= 15) {
      return { type: "PHONE" as const, value: v.replace(/[^\d+]/g, "") };
    }
    ctx.addIssue({ code: "custom", message: "contact" });
    return z.NEVER;
  });

export const quoteFormSchema = z
  .object({
    packageId: z.uuid(),
    name: z
      .string()
      .trim()
      .min(2, "name")
      .max(100, "name")
      .refine((v) => !/[<>{}]/.test(v), "name"),
    contact: contactSchema,
    consent: z.literal("yes", { message: "consent" }),
    // Honeypot: hidden from people, often filled in by bots. Must be empty.
    website: z.literal("", { message: "bot" }).optional().default(""),
  })
  .strict();

export type QuoteForm = z.infer<typeof quoteFormSchema>;
