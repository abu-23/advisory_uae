/**
 * Creates a sign-in account. There is no public sign-up.
 *
 *   pnpm user:create --role superadmin --email you@example.com --name "Your Name"
 *   pnpm user:create --role company --email owner@example.com --name "Owner" --company-slug al-noor-sample
 *
 * Prints a one-time password ONCE. The person must set up their authenticator app at
 * first sign-in; until then their session can do nothing else.
 * Uses MIGRATION_DATABASE_URL (the schema owner). Run it from a trusted machine.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { hashPassword } from "../src/server/auth/password";
import { PrismaClient } from "../src/generated/prisma/client";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const input = z
  .object({
    role: z.enum(["company", "admin", "superadmin"]),
    email: z.email(),
    name: z.string().trim().min(2).max(100),
    companySlug: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
  })
  .safeParse({ role: arg("role"), email: arg("email")?.toLowerCase(), name: arg("name"), companySlug: arg("company-slug") });

if (!input.success) {
  console.error("Usage: pnpm user:create --role company|admin|superadmin --email <email> --name <name> [--company-slug <slug>]");
  process.exit(1);
}
const { role, email, name, companySlug } = input.data;
if ((role === "company") !== Boolean(companySlug)) {
  console.error("Company users need --company-slug. Admins and superadmins must not have one.");
  process.exit(1);
}

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is not set.");
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const company = companySlug ? await db.company.findUnique({ where: { slug: companySlug }, select: { id: true } }) : null;
  if (companySlug && !company) throw new Error("Company not found");
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) throw new Error("That email already has an account");

  const password = randomBytes(18).toString("base64url");
  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      name,
      email,
      role,
      companyId: company?.id ?? null,
      accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(password) } },
    },
  });
  await db.auditLog.create({
    data: { actorRole: "system", action: "admin.manage", targetType: "app_user", targetId: id, metadata: { role, created: true } },
  });

  if (process.argv.includes("--json")) console.log(JSON.stringify({ id, email, role, password }));
  else {
    console.log(`Created ${role} account for ${email}.`);
    console.log(`One-time password (shown once, copy it now): ${password}`);
    console.log("They must set up their authenticator app at first sign-in.");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Failed");
    process.exit(1);
  })
  .finally(() => db.$disconnect());
