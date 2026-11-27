import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Every database call runs inside withDb(), which switches to a restricted
 * database role for the transaction. Row-level security then limits rows:
 * a company context can only ever see its own company's rows.
 */

export type DbContext =
  | { role: "public" }
  | { role: "company"; companyId: string }
  | { role: "admin" };

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// Fixed list. Role names are never taken from user input.
const DB_ROLE = {
  public: "app_public",
  company: "app_company",
  admin: "app_admin",
} as const satisfies Record<DbContext["role"], string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let shared: PrismaClient | undefined;

export function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function defaultClient(): PrismaClient {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    shared = createClient(url);
  }
  return shared;
}

export async function withDb<T>(
  ctx: DbContext,
  fn: (tx: Tx) => Promise<T>,
  client: PrismaClient = defaultClient(),
): Promise<T> {
  const role = DB_ROLE[ctx.role];
  if (!role) throw new Error("Unknown database context");
  if (ctx.role === "company" && !UUID.test(ctx.companyId)) {
    throw new Error("Invalid company id in database context");
  }

  return client.$transaction(async (tx) => {
    // Role name comes from the fixed map above, so it is safe to inline.
    // nosemgrep
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
    if (ctx.role === "company") {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${ctx.companyId}, true)`;
    }
    return fn(tx);
  });
}
