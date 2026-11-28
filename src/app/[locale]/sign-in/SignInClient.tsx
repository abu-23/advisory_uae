"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { authClient, errorCode } from "@/lib/auth-client";

type Step = "password" | "code" | "recovery";

export function SignInClient() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<"tooMany" | "badLogin" | "badCode" | null>(null);
  const [pending, setPending] = useState(false);

  function done() {
    router.replace("/account");
    router.refresh();
  }

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { data, error: err } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (err) return setError(errorCode(err) === "tooMany" ? "tooMany" : "badLogin");
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return setStep("code");
    done(); // signed in, but no authenticator yet: the account page walks them through it
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s+/g, "");
    setPending(true);
    setError(null);
    const { error: err } =
      step === "recovery"
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (err) return setError(errorCode(err) === "tooMany" ? "tooMany" : "badCode");
    done();
  }

  const errorBox = error && (
    <div className="alert" role="alert">
      <p>{t(`errors.${error}`)}</p>
    </div>
  );

  if (step === "password") {
    return (
      <form onSubmit={onPassword} className="stack" noValidate>
        {errorBox}
        <label className="field">
          {t("email")}
          <input name="email" type="email" dir="ltr" autoComplete="username" required />
        </label>
        <label className="field">
          {t("password")}
          <input name="password" type="password" dir="ltr" autoComplete="current-password" required />
        </label>
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? t("working") : t("signIn")}
        </button>
      </form>
    );
  }

  const recovery = step === "recovery";
  return (
    <form onSubmit={onCode} className="stack" noValidate>
      <p>{recovery ? t("recoveryIntro") : t("codeIntro")}</p>
      {errorBox}
      <label className="field">
        {recovery ? t("recoveryCode") : t("code")}
        <input
          name="code"
          dir="ltr"
          autoComplete="one-time-code"
          inputMode={recovery ? "text" : "numeric"}
          autoFocus
          required
        />
      </label>
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? t("working") : t("verify")}
      </button>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setError(null);
          setStep(recovery ? "code" : "recovery");
        }}
      >
        {recovery ? t("useAppInstead") : t("useRecovery")}
      </button>
    </form>
  );
}
