import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { answersToQuery, parseAnswers } from "@/lib/filters";
import { formatAmount, formatDate, formatRating } from "@/lib/format";
import { pick, pickList } from "@/lib/i18n-helpers";
import { getCompanyProfile } from "@/server/data/catalog";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const profile = await getCompanyProfile(slug);
  if (!profile) notFound();

  const [t, tr, tc] = await Promise.all([
    getTranslations("profile"),
    getTranslations("results"),
    getTranslations("common"),
  ]);
  const answers = parseAnswers(raw);
  const backHref = answers ? `/${locale}/results?${answersToQuery(answers)}` : `/${locale}`;
  const pkg = profile.packages.find((p) => p.id === raw.pkg) ?? profile.packages[0];
  const v = profile.verification;
  const days = (min: number, max: number) =>
    min === max ? tc("workingDaysSame", { days: min }) : tc("workingDays", { min, max });

  return (
    <div className="stack">
      <a href={backHref} className="back-link">
        {t("allCompanies")}
      </a>
      <h1>{profile.name}</h1>
      {pkg && (
        <p className="muted">
          {t("packageLine", {
            title: pick(locale, pkg.titleEn, pkg.titleAr),
            amount: formatAmount(pkg.govFeesFils + pkg.serviceFeeFils, locale),
          })}
        </p>
      )}

      {v.verified && v.checkedAt ? (
        <section className="info-box info-verified">
          <h2 className="section-title">
            <span aria-hidden="true">✓</span> {t("verifiedTitle")}
          </h2>
          <p>
            {t("verifiedBody", { date: formatDate(v.checkedAt, locale) })}{" "}
            {v.licenceExpiresAt && t("licenceValid", { date: formatDate(v.licenceExpiresAt, locale) })}
          </p>
          <p className="small">{t("verifiedNote")}</p>
        </section>
      ) : (
        <section className="info-box info-unverified">
          <h2 className="section-title">{t("unverifiedTitle")}</h2>
          <p>{t("unverifiedBody")}</p>
        </section>
      )}

      {pkg && (
        <>
          <section className="card">
            <h2 className="section-title">{t("breakdown")}</h2>
            <dl className="breakdown">
              <div>
                <dt>{t("govFees")}</dt>
                <dd>{tc("aed", { amount: formatAmount(pkg.govFeesFils, locale) })}</dd>
              </div>
              <div>
                <dt>{t("serviceFee")}</dt>
                <dd>{tc("aed", { amount: formatAmount(pkg.serviceFeeFils, locale) })}</dd>
              </div>
              <div className="total">
                <dt>{t("year1")}</dt>
                <dd>{tc("aed", { amount: formatAmount(pkg.govFeesFils + pkg.serviceFeeFils, locale) })}</dd>
              </div>
              <div>
                <dt>{t("renewal")}</dt>
                <dd>
                  {pkg.renewalFeeFils === null
                    ? tc("notStated")
                    : tc("perPeriod", {
                        amount: formatAmount(pkg.renewalFeeFils, locale),
                        months: pkg.renewalPeriodMonths ?? 12,
                      })}
                </dd>
              </div>
              <div>
                <dt>{t("turnaround")}</dt>
                <dd>{days(pkg.turnaroundDaysMin, pkg.turnaroundDaysMax)}</dd>
              </div>
            </dl>
            {pkg.renewalFeeFils === null && <p className="warn">{tr("renewalWarning")}</p>}
            {pkg.priceStale && <p className="warn">{tr("stale")}</p>}
            <p className="muted small">{t("supplied", { date: formatDate(pkg.priceUpdatedAt, locale) })}</p>
          </section>

          <section className="card two-col">
            <div>
              <h2 className="section-title">{t("included")}</h2>
              <ul className="ticks">
                {pickList(locale, pkg.includesEn, pkg.includesAr).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="section-title">{t("notIncluded")}</h2>
              <ul className="crosses">
                {pickList(locale, pkg.excludesEn, pkg.excludesAr).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}

      <section className="card">
        <h2 className="section-title">
          {t("reviewsTitle")}
          {profile.rating !== null && (
            <span className="small">
              {" "}
              <span aria-hidden="true">★</span> {formatRating(profile.rating, locale)}{" "}
              <span className="muted">{tr("reviews", { count: profile.reviewCount })}</span>
            </span>
          )}
        </h2>
        <p className="muted small">{t("reviewsNote")}</p>
        {profile.reviews.length === 0 ? (
          <p className="muted">{t("noReviews")}</p>
        ) : (
          <ul className="stack-sm" role="list">
            {profile.reviews.map((r) => (
              <li key={r.id} className="review">
                <p className="small muted">
                  {"★".repeat(r.rating)} · {r.isSample ? t("sampleReview") : t("verifiedCustomer", { date: formatDate(r.createdAt, locale) })}
                </p>
                {/* Review text is user content: rendered as text, never as HTML. */}
                <p>{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
