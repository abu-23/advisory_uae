"use server";

import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseAnswers } from "@/lib/filters";
import { quoteFormSchema } from "@/lib/quote-form";
import { checkLimits, QUOTE_LIMITS, rateLimiter } from "@/server/ratelimit/ratelimit";
import { createQuoteRequest, findQuoteTarget } from "@/server/quote/submit";

export type QuoteFormState = { errors: string[]; values: { name: string; contact: string } };

/** Client IP for rate limiting. Behind the load balancer, its X-Forwarded-For is trusted. */
async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function submitQuote(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const locale = formData.get("locale") === "ar" ? "ar" : "en";
  const values = {
    name: String(formData.get("name") ?? "").slice(0, 100),
    contact: String(formData.get("contact") ?? "").slice(0, 120),
  };

  if (!(await checkLimits(await rateLimiter(), QUOTE_LIMITS, await clientKey()))) {
    return { errors: ["rate"], values };
  }

  const parsed = quoteFormSchema.safeParse({
    packageId: formData.get("packageId"),
    name: formData.get("name"),
    contact: formData.get("contact"),
    consent: formData.get("consent") ?? undefined,
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    const codes = [...new Set(parsed.error.issues.map((i) => i.path[0]))];
    // A filled honeypot gets the normal "sent" page, so bots learn nothing.
    if (codes.includes("website")) redirect(`/${locale}/quote/sent`);
    const known = ["name", "contact", "consent"].filter((c) => codes.includes(c));
    return { errors: known.length ? known : ["general"], values };
  }

  const answerParams = new URLSearchParams(String(formData.get("answers") ?? ""));
  const answers = parseAnswers({
    s: answerParams.getAll("s"),
    loc: answerParams.get("loc") ?? undefined,
    visas: answerParams.get("visas") ?? undefined,
    time: answerParams.get("time") ?? undefined,
  });
  const target = await findQuoteTarget(parsed.data.packageId);
  if (!target || !answers) return { errors: ["general"], values };

  // Hash the exact sentence the person saw, in the language they saw it.
  const t = await getTranslations({ locale, namespace: "quote" });
  const consentText = t("consent", { company: target.companyName });

  try {
    await createQuoteRequest({ form: parsed.data, answers, target, consentText, locale });
  } catch (e) {
    // Log the error type only: never the form values.
    console.error("quote.create failed:", e instanceof Error ? e.name + ": " + e.message.slice(0, 200) : "unknown");
    return { errors: ["general"], values };
  }
  redirect(`/${locale}/quote/sent?company=${encodeURIComponent(target.companySlug)}`);
}
