import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { VerificationBadge } from "@/components/VerificationBadge";
import { answersToQuery, parseAnswers } from "@/lib/filters";
import { formatAmount, formatDate, formatRating } from "@/lib/format";
import { pick } from "@/lib/i18n-helpers";
import { findPackages } from "@/server/data/catalog";

export const dynamic = "force-dynamic";

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const answers = parseAnswers(raw);
  if (!answers) redirect(`/${locale}?error=pick`);
  const verifiedOnly = raw.verified === "1";

  const [t, tc, tl, ts] = await Promise.all([
    getTranslations("results"),
    getTranslations("common"),
    getTranslations("locations"),
    getTranslations("services"),
  ]);
  const items = await findPackages(answers, { verifiedOnly });
  const query = answersToQuery(answers);
  const days = (min: number, max: number) =>
    min === max ? tc("workingDaysSame", { days: min }) : tc("workingDays", { min, max });

  return (
    <div className="stack">
      <a href={`/${locale}/questions?${query}`} className="back-link">
        {tc("back")}
      </a>
      <p className="eyebrow">
        {answers.services.map((s) => ts(s)).join(" + ")} ·{" "}
        {t("summary", { location: tl(answers.location), visas: answers.visas })}
      </p>
      <h1>{t("title")}</h1>

      <div className="toggle-row">
        <span>{t("verifiedOnly")}</span>
        <a
          href={`/${locale}/results?${answersToQuery(answers, verifiedOnly ? {} : { verified: "1" })}`}
          className={`toggle ${verifiedOnly ? "toggle-on" : ""}`}
          role="switch"
          aria-checked={verifiedOnly}
          aria-label={t("verifiedOnly")}
        >
          <span className="toggle-knob" />
        </a>
      </div>
      <p className="info-box">{t("explainer")}</p>

      <p className="list-meta">
        <strong>{t("count", { count: items.length })}</strong> <span className="muted">{t("order")}</span>
      </p>

      {items.length === 0 && (
        <p className="card">
          {t("empty")} <a href={`/${locale}/questions?${query}`}>{t("changeAnswers")}</a>
        </p>
      )}

      <ul className="stack-sm" role="list">
        {items.map((item) => (
          <li key={item.packageId}>
            <a href={`/${locale}/companies/${item.companySlug}?${query}&pkg=${item.packageId}`} className="card result-card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">{item.companyName}</h2>
                  <p className="muted small">{pick(locale, item.titleEn, item.titleAr)}</p>
                </div>
                <div className="price">
                  <span className="muted small">{t("year1")}</span>
                  <strong>{tc("aed", { amount: formatAmount(item.year1Fils, locale) })}</strong>
                </div>
              </div>
              <VerificationBadge verified={item.verified} checkedAt={item.checkedAt} locale={locale} />
              <dl className="facts">
                <div>
                  <dt>{t("renewal")}</dt>
                  <dd>
                    {item.renewalFils === null
                      ? tc("notStated")
                      : tc("perPeriod", {
                          amount: formatAmount(item.renewalFils, locale),
                          months: item.renewalPeriodMonths ?? 12,
                        })}
                  </dd>
                </div>
                <div>
                  <dt>{t("turnaround")}</dt>
                  <dd>{days(item.turnaroundMin, item.turnaroundMax)}</dd>
                </div>
              </dl>
              <p className="small">
                {item.rating !== null ? (
                  <>
                    <span aria-hidden="true">★</span> {formatRating(item.rating, locale)}{" "}
                    <span className="muted">{t("reviews", { count: item.reviewCount })}</span>
                  </>
                ) : (
                  <span className="muted">{t("noReviews")}</span>
                )}
              </p>
              <p className="muted small">{t("updated", { date: formatDate(item.priceUpdatedAt, locale) })}</p>
              {item.renewalFils === null && <p className="warn">{t("renewalWarning")}</p>}
              {item.priceStale && <p className="warn">{t("stale")}</p>}
            </a>
          </li>
        ))}
      </ul>
      <p className="muted small">{t("pricesNote")}</p>
    </div>
  );
}
