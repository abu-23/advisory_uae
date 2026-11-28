import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/server/auth/auth";
import { getActor } from "@/server/policy/session";
import { EnrolClient } from "./EnrolClient";
import { SignOutButton } from "./SignOutButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const h = await headers();
  const actor = await getActor(h);
  if (actor.kind === "visitor") redirect({ href: "/sign-in", locale });

  const t = await getTranslations("auth");
  const info = await auth().api.getSession({ headers: h });
  const name = info?.user.name ?? "";

  return (
    <div className="stack">
      <h1>{t("accountTitle")}</h1>
      {name && <p className="muted">{t("signedInAs", { name })}</p>}
      {actor.kind === "mfa_required" ? (
        <EnrolClient />
      ) : (
        <>
          <section className="info-box info-verified">
            <p>{t(`roles.${actor.kind}`)}</p>
          </section>
          <p>{t("portalSoon")}</p>
        </>
      )}
      <SignOutButton />
    </div>
  );
}
