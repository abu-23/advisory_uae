import type { Answers } from "@/lib/filters";
import { withDb, type Tx } from "@/server/data/db";
import { hideBefore, isPriceStale, rankResults } from "@/server/domain/ranking";

/** Public catalogue reads. Visitor role only: no contact data, no licence numbers. */

export type Verification = { verified: boolean; checkedAt: Date | null; licenceExpiresAt: Date | null };

export type ResultItem = {
  packageId: string;
  companySlug: string;
  companyName: string;
  isSample: boolean;
  titleEn: string;
  titleAr: string;
  year1Fils: number;
  renewalFils: number | null;
  renewalPeriodMonths: number | null;
  turnaroundMin: number;
  turnaroundMax: number;
  priceUpdatedAt: Date;
  priceStale: boolean;
  rating: number | null;
  reviewCount: number;
} & Verification;

async function verificationsFor(tx: Tx, companyIds: string[]): Promise<Map<string, Verification>> {
  if (companyIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<
    { company_id: string; checked_at: Date; licence_expires_at: Date; is_verified: boolean }[]
  >`SELECT company_id, checked_at, licence_expires_at, is_verified
      FROM company_verification WHERE company_id = ANY(${companyIds}::uuid[])`;
  return new Map(
    rows.map((r) => [
      r.company_id,
      { verified: r.is_verified, checkedAt: r.checked_at, licenceExpiresAt: r.licence_expires_at },
    ]),
  );
}

async function ratingsFor(tx: Tx, companyIds: string[]) {
  if (companyIds.length === 0) return new Map<string, { avg: number; count: number }>();
  const rows = await tx.review.groupBy({
    by: ["companyId"],
    where: { companyId: { in: companyIds }, status: "PUBLISHED" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.companyId, { avg: r._avg.rating ?? 0, count: r._count._all }]));
}

const UNVERIFIED: Verification = { verified: false, checkedAt: null, licenceExpiresAt: null };

export async function findPackages(answers: Answers, opts: { verifiedOnly: boolean }): Promise<ResultItem[]> {
  return withDb({ role: "public" }, async (tx) => {
    const packages = await tx.package.findMany({
      where: {
        status: "LIVE",
        serviceTypes: { hasEvery: answers.services },
        locations: { has: answers.location },
        priceUpdatedAt: { gte: hideBefore() },
        ...(answers.services.includes("VISA") ? { visasMax: { gte: answers.visas } } : {}),
      },
      select: {
        id: true,
        titleEn: true,
        titleAr: true,
        govFeesFils: true,
        serviceFeeFils: true,
        renewalFeeFils: true,
        renewalPeriodMonths: true,
        turnaroundDaysMin: true,
        turnaroundDaysMax: true,
        priceUpdatedAt: true,
        company: { select: { id: true, slug: true, name: true, isSample: true } },
      },
      take: 100,
    });

    const ids = [...new Set(packages.map((p) => p.company.id))];
    const [verifications, ratings] = await Promise.all([verificationsFor(tx, ids), ratingsFor(tx, ids)]);

    const items: ResultItem[] = packages.map((p) => {
      const v = verifications.get(p.company.id) ?? UNVERIFIED;
      const r = ratings.get(p.company.id);
      return {
        packageId: p.id,
        companySlug: p.company.slug,
        companyName: p.company.name,
        isSample: p.company.isSample,
        titleEn: p.titleEn,
        titleAr: p.titleAr,
        year1Fils: p.govFeesFils + p.serviceFeeFils,
        renewalFils: p.renewalFeeFils,
        renewalPeriodMonths: p.renewalPeriodMonths,
        turnaroundMin: p.turnaroundDaysMin,
        turnaroundMax: p.turnaroundDaysMax,
        priceUpdatedAt: p.priceUpdatedAt,
        priceStale: isPriceStale(p.priceUpdatedAt),
        rating: r && r.count > 0 ? r.avg : null,
        reviewCount: r?.count ?? 0,
        ...v,
      };
    });

    return rankResults(opts.verifiedOnly ? items.filter((i) => i.verified) : items);
  });
}

export type CompanyProfile = {
  slug: string;
  name: string;
  verification: Verification;
  rating: number | null;
  reviewCount: number;
  reviews: { id: string; rating: number; text: string; createdAt: Date; isSample: boolean }[];
  packages: {
    id: string;
    titleEn: string;
    titleAr: string;
    govFeesFils: number;
    serviceFeeFils: number;
    renewalFeeFils: number | null;
    renewalPeriodMonths: number | null;
    turnaroundDaysMin: number;
    turnaroundDaysMax: number;
    includesEn: string[];
    includesAr: string[];
    excludesEn: string[];
    excludesAr: string[];
    priceUpdatedAt: Date;
    priceStale: boolean;
  }[];
};

export async function getCompanyProfile(slug: string): Promise<CompanyProfile | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return withDb({ role: "public" }, async (tx) => {
    const company = await tx.company.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!company) return null;

    const [packages, reviews, verifications, ratings] = await Promise.all([
      tx.package.findMany({
        where: { companyId: company.id, status: "LIVE", priceUpdatedAt: { gte: hideBefore() } },
        select: {
          id: true,
          titleEn: true,
          titleAr: true,
          govFeesFils: true,
          serviceFeeFils: true,
          renewalFeeFils: true,
          renewalPeriodMonths: true,
          turnaroundDaysMin: true,
          turnaroundDaysMax: true,
          includesEn: true,
          includesAr: true,
          excludesEn: true,
          excludesAr: true,
          priceUpdatedAt: true,
        },
        orderBy: { serviceFeeFils: "asc" },
      }),
      tx.review.findMany({
        where: { companyId: company.id, status: "PUBLISHED" },
        select: { id: true, rating: true, text: true, createdAt: true, isSample: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      verificationsFor(tx, [company.id]),
      ratingsFor(tx, [company.id]),
    ]);

    const r = ratings.get(company.id);
    return {
      slug: company.slug,
      name: company.name,
      verification: verifications.get(company.id) ?? UNVERIFIED,
      rating: r && r.count > 0 ? r.avg : null,
      reviewCount: r?.count ?? 0,
      reviews,
      packages: packages.map((p) => ({ ...p, priceStale: isPriceStale(p.priceUpdatedAt) })),
    };
  });
}
