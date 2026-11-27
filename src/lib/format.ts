/** Western digits in both languages (common in the UAE), Dubai time zone. */

const numberLocale = (locale: string) => (locale === "ar" ? "ar-AE-u-nu-latn" : "en-AE");

export function formatAmount(fils: number, locale: string): string {
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 0 }).format(fils / 100);
}

export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(numberLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  }).format(date);
}

export function formatRating(avg: number, locale: string): string {
  return new Intl.NumberFormat(numberLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(avg);
}
