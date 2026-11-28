import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { dirFor, routing } from "@/i18n/routing";
import "./globals.css";

export const metadata: Metadata = {
  title: "Advisr UAE",
  description: "Compare UAE business service companies.",
  robots: { index: false, follow: false },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Advisr", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#12213a",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("common");

  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body>
        <NextIntlClientProvider>
          <div className="sample-banner" role="note">
            {t("sampleBanner")}
          </div>
          <header className="topbar">
            <span className="brand">{t("brand")}</span>
            <Suspense>
              <LocaleSwitch label={t("switchLanguage")} title={t("switchLanguageLabel")} />
            </Suspense>
          </header>
          <main className="page">{children}</main>
          <footer className="page-footer">
            <a href={`/${locale}/sign-in`}>{t("partnerSignIn")}</a>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
