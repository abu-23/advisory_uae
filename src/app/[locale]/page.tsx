import { getTranslations, setRequestLocale } from "next-intl/server";
import { SERVICES } from "@/lib/filters";

export default async function PickServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { error } = await searchParams;
  const t = await getTranslations("home");
  const ts = await getTranslations("services");

  // A plain form: works without JavaScript, sends only service codes.
  return (
    <form action={`/${locale}/questions`} method="get" className="stack">
      <h1>{t("title")}</h1>
      <p className="muted">{t("intro")}</p>
      {error === "pick" && (
        <p className="alert" role="alert">
          {t("pickOne")}
        </p>
      )}
      <fieldset className="stack-sm">
        <legend className="visually-hidden">{t("title")}</legend>
        {SERVICES.map((s) => (
          <label key={s} className="choice-card">
            <input type="checkbox" name="s" value={s} />
            <span>
              <span className="choice-title">{ts(s)}</span>
              <span className="choice-desc">{ts(`${s}_desc`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="note">{t("noSignup")}</p>
      <button type="submit" className="btn-primary">
        {t("continue")}
      </button>
    </form>
  );
}
