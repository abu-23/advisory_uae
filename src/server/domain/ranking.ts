/**
 * Default results order: verified first, then lowest year-1 total, then name.
 * There is no paid placement. Any sponsored slot must be separate and labelled.
 */

export const PRICE_STALE_DAYS = 60;
export const PRICE_HIDE_DAYS = 90;
const DAY = 86_400_000;

export type Rankable = { verified: boolean; year1Fils: number; companyName: string };

export function rankResults<T extends Rankable>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Number(b.verified) - Number(a.verified) ||
      a.year1Fils - b.year1Fils ||
      a.companyName.localeCompare(b.companyName),
  );
}

export function priceAgeDays(priceUpdatedAt: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - priceUpdatedAt.getTime()) / DAY);
}

export const isPriceStale = (d: Date, now?: Date) => priceAgeDays(d, now) > PRICE_STALE_DAYS;
export const hideBefore = (now: Date = new Date()) => new Date(now.getTime() - PRICE_HIDE_DAYS * DAY);
