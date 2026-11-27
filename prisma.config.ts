import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations run as the schema owner. The app itself connects with DATABASE_URL,
// a separate login that has only the grants set in the migrations.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Empty is fine for `prisma generate`; migrate commands fail clearly without it.
    url: process.env.MIGRATION_DATABASE_URL ?? "",
  },
});
