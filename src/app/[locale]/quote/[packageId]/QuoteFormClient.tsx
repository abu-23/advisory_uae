"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { submitQuote, type QuoteFormState } from "./actions";

export function QuoteFormClient({
  locale,
  packageId,
  answersQuery,
  companyName,
}: {
  locale: string;
  packageId: string;
  answersQuery: string;
  companyName: string;
}) {
  const t = useTranslations("quote");
  const [state, action, pending] = useActionState<QuoteFormState, FormData>(submitQuote, {
    errors: [],
    values: { name: "", contact: "" },
  });
  const [agreed, setAgreed] = useState(false);
  const has = (code: string) => state.errors.includes(code);

  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="packageId" value={packageId} />
      <input type="hidden" name="answers" value={answersQuery} />

      {state.errors.length > 0 && (
        <div className="alert" role="alert">
          {state.errors.map((e) => (
            <p key={e}>{t(`errors.${e}`)}</p>
          ))}
        </div>
      )}

      <label className="field">
        <span>{t("name")}</span>
        <input
          name="name"
          autoComplete="name"
          maxLength={100}
          required
          defaultValue={state.values.name}
          aria-invalid={has("name")}
        />
      </label>
      <label className="field">
        <span>{t("contact")}</span>
        <input
          name="contact"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          maxLength={120}
          required
          defaultValue={state.values.contact}
          aria-invalid={has("contact")}
        />
      </label>

      {/* Honeypot for bots. Hidden from people and screen readers. */}
      <div className="hp" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="consent">
        <input
          type="checkbox"
          name="consent"
          value="yes"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          aria-invalid={has("consent")}
        />
        <span>
          {t("consent", { company: companyName })} <span className="muted">{t("privacy")}</span>
        </span>
      </label>

      <p className="note">{t("neverAsk")}</p>
      <button type="submit" className="btn-primary" disabled={pending}>
        {t("send")}
      </button>
      {!agreed && <p className="note">{t("tickFirst")}</p>}
    </form>
  );
}
