import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { answersToQuery, parseAnswers } from "@/lib/filters";
import { findQuoteTarget } from "@/server/quote/submit";
import { QuoteFormClient } from "./QuoteFormClient";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; packageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, packageId } = await params;
  setRequestLocale(locale);
  if (!UUID.test(packageId)) notFound();
  const answers = parseAnswers(await searchParams);
  const target = await findQuoteTarget(packageId);
  if (!target || !answers) notFound();

  const [t, tc, ts, tl, tt, tr] = await Promise.all([
    getTranslations("quote"),
    getTranslations("common"),
    getTranslations("services"),
    getTranslations("locations"),
    getTranslations("timings"),
    getTranslations("results"),
  ]);
  const query = answersToQuery(answers);

  return (
    <div className="stack">
      <a href={`/${locale}/companies/${target.companySlug}?${query}&pkg=${packageId}`} className="back-link">
        {tc("back")}
      </a>
      <h1>{t("title")}</h1>
      <p className="muted">{t("from", { company: target.companyName })}</p>

      <section className="info-box">
        <h2 className="section-title">{t("willSee")}</h2>
        <p>{answers.services.map((s) => ts(s)).join(" + ")}</p>
        <p>
          {tr("summary", { location: tl(answers.location), visas: answers.visas })} · {tt(answers.timing)}
        </p>
        <p>{t("yourDetails")}</p>
      </section>

      <QuoteFormClient
        locale={locale}
        packageId={packageId}
        answersQuery={query}
        companyName={target.companyName}
      />
    </div>
  );
}
