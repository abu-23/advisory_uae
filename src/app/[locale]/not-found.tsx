import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("profile");
  return <p className="card">{t("notFound")}</p>;
}
