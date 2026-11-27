"use client";

import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";

/** Same page, other language, same answers. */
export function LocaleSwitch({ label, title }: { label: string; title: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams();
  const other = locale === "ar" ? "en" : "ar";
  const query = Object.fromEntries([...search.keys()].map((k) => [k, search.getAll(k)]));

  return (
    <Link
      className="locale-switch"
      href={{ pathname, query }}
      locale={other}
      lang={other}
      title={title}
      hrefLang={other}
    >
      {label}
    </Link>
  );
}
