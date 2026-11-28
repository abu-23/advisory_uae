"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { QrCode } from "@/components/QrCode";
import { useRouter } from "@/i18n/navigation";
import { authClient, errorCode, secretFromUri } from "@/lib/auth-client";

type Step = "password" | "scan" | "codes";

/** Required for every account: link an authenticator app, then save the one-time recovery codes. */
export function EnrolClient() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<"tooMany" | "badPassword" | "badCode" | null>(null);
  const [pending, setPending] = useState(false);

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (err || !data || !("totpURI" in data)) return setError(errorCode(err) === "tooMany" ? "tooMany" : "badPassword");
    setUri(data.totpURI);
    setCodes(data.backupCodes);
    setStep("scan");
  }

  async function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s+/g, "");
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (err) return setError(errorCode(err) === "tooMany" ? "tooMany" : "badCode");
    setStep("codes");
  }

  const errorBox = error && (
    <div className="alert" role="alert">
      <p>{t(`errors.${error}`)}</p>
    </div>
  );

  if (step === "password") {
    return (
      <form onSubmit={onPassword} className="stack" noValidate>
        <h2 className="section-title">{t("enrolTitle")}</h2>
        <p>{t("enrolIntro")}</p>
        {errorBox}
        <label className="field">
          {t("confirmPassword")}
          <input name="password" type="password" dir="ltr" autoComplete="current-password" required />
        </label>
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? t("working") : t("startSetup")}
        </button>
      </form>
    );
  }

  if (step === "scan") {
    return (
      <form onSubmit={onVerify} className="stack" noValidate>
        <h2 className="section-title">{t("scanTitle")}</h2>
        <p>{t("scanIntro")}</p>
        <QrCode value={uri} label={t("qrLabel")} />
        <details>
          <summary>{t("cantScan")}</summary>
          <p className="small muted">{t("typeSecret")}</p>
          <code dir="ltr" className="secret">
            {secretFromUri(uri)}
          </code>
        </details>
        {errorBox}
        <label className="field">
          {t("code")}
          <input name="code" dir="ltr" autoComplete="one-time-code" inputMode="numeric" required />
        </label>
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? t("working") : t("verify")}
        </button>
      </form>
    );
  }

  return (
    <div className="stack">
      <h2 className="section-title">{t("codesTitle")}</h2>
      <p>{t("codesIntro")}</p>
      <ul className="recovery-codes" dir="ltr">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <label className="consent">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>{t("codesSaved")}</span>
      </label>
      <button
        className="btn-primary"
        type="button"
        disabled={!saved}
        onClick={() => {
          setCodes([]);
          router.refresh();
        }}
      >
        {t("continue")}
      </button>
    </div>
  );
}
