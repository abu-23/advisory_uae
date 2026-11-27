import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCompanyProfile } from "@/server/data/catalog";

export const dynamic = "force-dynamic";

export default async function QuoteSentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { company } = await searchParams;
  const profile = typeof company === "string" ? await getCompanyProfile(company) : null;
  const t = await getTranslations("quote");

  return (
    <div className="stack">
      <div className="sent-icon" aria-hidden="true">
        ✓
      </div>
      <h1>{t("sentTitle")}</h1>
      {profile && <p>{t("sentBody", { company: profile.name })}</p>}
      <section className="info-box info-unverified">
        <h2 className="section-title">{t("beforePay")}</h2>
        <p>{t("beforePayBody")}</p>
      </section>
      <a href={`/${locale}`} className="btn-primary">
        {t("backToCompanies")}
      </a>
    </div>
  );
}
