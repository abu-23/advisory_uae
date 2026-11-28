import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getActor } from "@/server/policy/session";
import { SignInClient } from "./SignInClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if ((await getActor(await headers())).kind !== "visitor") redirect({ href: "/account", locale });
  const t = await getTranslations("auth");
  return (
    <div className="stack">
      <h1>{t("signInTitle")}</h1>
      <p className="muted">{t("signInIntro")}</p>
      <SignInClient />
    </div>
  );
}
