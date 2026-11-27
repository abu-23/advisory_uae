import { getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/format";

export async function VerificationBadge({
  verified,
  checkedAt,
  locale,
}: {
  verified: boolean;
  checkedAt: Date | null;
  locale: string;
}) {
  const t = await getTranslations("results");
  return verified && checkedAt ? (
    <span className="badge badge-verified">
      <span aria-hidden="true">✓</span> {t("verified", { date: formatDate(checkedAt, locale) })}
    </span>
  ) : (
    <span className="badge badge-unverified">{t("unverified")}</span>
  );
}
