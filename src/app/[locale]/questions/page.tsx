import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { LOCATIONS, MAX_VISAS, parseServices, TIMINGS } from "@/lib/filters";

export default async function QuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const services = parseServices(await searchParams);
  if (services.length === 0) redirect(`/${locale}?error=pick`);

  const t = await getTranslations("questions");
  const tc = await getTranslations("common");
  const tl = await getTranslations("locations");
  const tt = await getTranslations("timings");
  const needsVisas = services.includes("VISA");

  return (
    <form action={`/${locale}/results`} method="get" className="stack">
      <a href={`/${locale}`} className="back-link">
        {tc("back")}
      </a>
      <p className="eyebrow">{t("step")}</p>
      <h1>{t("title")}</h1>
      <p className="muted">{t("noPersonal")}</p>
      {services.map((s) => (
        <input key={s} type="hidden" name="s" value={s} />
      ))}

      <fieldset className="stack-sm">
        <legend className="q-label">{t("location")}</legend>
        {LOCATIONS.map((l, i) => (
          <label key={l} className="choice-row">
            <input type="radio" name="loc" value={l} defaultChecked={i === 0} required />
            <span>{tl(l)}</span>
          </label>
        ))}
      </fieldset>

      {needsVisas && (
        <label className="stack-sm">
          <span className="q-label">{t("visas")}</span>
          <input
            className="number-input"
            type="number"
            name="visas"
            min={1}
            max={MAX_VISAS}
            defaultValue={2}
            inputMode="numeric"
            required
          />
        </label>
      )}

      <fieldset className="stack-sm">
        <legend className="q-label">{t("timing")}</legend>
        {TIMINGS.map((x, i) => (
          <label key={x} className="choice-row">
            <input type="radio" name="time" value={x} defaultChecked={i === 1} required />
            <span>{tt(x)}</span>
          </label>
        ))}
      </fieldset>

      <button type="submit" className="btn-primary">
        {t("submit")}
      </button>
    </form>
  );
}
