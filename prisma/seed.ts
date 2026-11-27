/**
 * Sample data only. Every company and review is fake and marked "(sample)".
 * Refuses to run in production. Uses the migration (owner) connection.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";

if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
  console.error("Refusing to seed sample data in production.");
  process.exit(1);
}

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is not set.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const SAMPLE_ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const AED = (n: number) => Math.round(n * 100);
const GOV_FEES = AED(7300);
const d = (s: string) => new Date(`${s}T09:00:00Z`);

type Sample = {
  slug: string;
  name: string;
  serviceFee: number;
  renewal: number | null;
  days: [number, number];
  updated: string;
  checked?: string;
  licenceExpires?: string;
  ratings: number[];
};

// From the prototype. Year-1 total = government fees (AED 7,300, indicative) + service fee.
const samples: Sample[] = [
  { slug: "al-noor-sample", name: "Al Noor Business Services (sample)", serviceFee: 7500, renewal: 9200, days: [5, 7], updated: "2026-11-20", checked: "2026-11-12", licenceExpires: "2027-03-18", ratings: [5, 5, 4] },
  { slug: "harbor-gate-sample", name: "Harbor Gate Consultants (sample)", serviceFee: 5600, renewal: 8400, days: [7, 10], updated: "2026-11-18", checked: "2026-11-20", licenceExpires: "2027-06-30", ratings: [4, 5, 4] },
  { slug: "desert-rose-sample", name: "Desert Rose PRO (sample)", serviceFee: 8900, renewal: 9000, days: [3, 5], updated: "2026-11-22", checked: "2026-11-05", licenceExpires: "2027-09-01", ratings: [5, 5] },
  { slug: "falcon-edge-sample", name: "Falcon Edge Setup (sample)", serviceFee: 2690, renewal: null, days: [5, 7], updated: "2026-11-01", ratings: [] },
  { slug: "blue-palm-sample", name: "Blue Palm Services (sample)", serviceFee: 3700, renewal: 7500, days: [10, 14], updated: "2026-11-09", ratings: [] },
];

const includes = {
  en: ["Trade licence issue", "Establishment card", "2 residence visas", "Document typing"],
  ar: ["إصدار الرخصة التجارية", "بطاقة المنشأة", "تأشيرتا إقامة", "طباعة المستندات"],
};
const excludes = {
  en: ["Office rental / Ejari", "Bank account opening", "Medical tests for family"],
  ar: ["إيجار المكتب / إيجاري", "فتح حساب بنكي", "الفحوص الطبية للعائلة"],
};

async function main() {
  await db.policyVersion.upsert({
    where: { version: "draft-0" },
    update: {},
    create: {
      version: "draft-0",
      textEn: "DRAFT consent wording, pending legal review.",
      textAr: "صيغة موافقة مبدئية، بانتظار المراجعة القانونية.",
      publishedAt: d("2026-11-27"),
    },
  });

  for (const s of samples) {
    const company = await db.company.upsert({
      where: { slug: s.slug },
      update: {},
      create: { slug: s.slug, name: s.name, locations: ["DUBAI_MAINLAND"], isSample: true },
    });

    const existing = await db.package.count({ where: { companyId: company.id } });
    if (existing === 0) {
      const pkg: Prisma.PackageUncheckedCreateInput = {
        companyId: company.id,
        serviceTypes: ["TRADE_LICENSE", "VISA"],
        locations: ["DUBAI_MAINLAND"],
        titleEn: "Mainland licence + 2 visas",
        titleAr: "رخصة بر رئيسي + تأشيرتان",
        govFeesFils: GOV_FEES,
        serviceFeeFils: AED(s.serviceFee),
        renewalFeeFils: s.renewal === null ? null : AED(s.renewal),
        renewalPeriodMonths: s.renewal === null ? null : 12,
        visasMin: 0,
        visasMax: 2,
        turnaroundDaysMin: s.days[0],
        turnaroundDaysMax: s.days[1],
        includesEn: includes.en,
        includesAr: includes.ar,
        excludesEn: excludes.en,
        excludesAr: excludes.ar,
        priceUpdatedAt: d(s.updated),
        status: "LIVE",
      };
      await db.package.create({ data: pkg });
    }

    if (s.checked && s.licenceExpires && (await db.verificationRecord.count({ where: { companyId: company.id } })) === 0) {
      await db.verificationRecord.create({
        data: {
          companyId: company.id,
          status: "VERIFIED",
          checkedAt: d(s.checked),
          licenceExpiresAt: d(s.licenceExpires),
          checkedBy: SAMPLE_ADMIN_ID,
        },
      });
    }

    if ((await db.review.count({ where: { companyId: company.id } })) === 0) {
      for (const rating of s.ratings) {
        await db.review.create({
          data: {
            companyId: company.id,
            rating,
            text: "Sample review text. Final price matched the quote and the licence arrived on time.",
            status: "PUBLISHED",
            isSample: true,
          },
        });
      }
    }
  }

  console.log(`Seeded ${samples.length} sample companies.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
