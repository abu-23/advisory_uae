/** Choose the stored text in the page language, falling back to English. */
export function pick(locale: string, en: string, ar: string): string {
  return locale === "ar" && ar ? ar : en;
}

export function pickList(locale: string, en: string[], ar: string[]): string[] {
  return locale === "ar" && ar.length > 0 ? ar : en;
}
