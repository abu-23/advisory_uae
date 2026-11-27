# Database

PostgreSQL with Prisma. Migrations live in `prisma/migrations` and are committed.

## Two logins

| Login | Used by | Can do |
| --- | --- | --- |
| Schema owner (`MIGRATION_DATABASE_URL`) | `pnpm db:migrate`, `pnpm db:seed` | Create and change tables. Bypasses row-level security as table owner. Never used by the running app. |
| App login (`DATABASE_URL`) | The running app | Only what the roles below allow. |

Create the app login once per environment (ops task, not a migration):

```sql
CREATE ROLE advisr_app LOGIN NOINHERIT PASSWORD '<from the secrets manager>';
GRANT app_public, app_company, app_admin TO advisr_app;
```

`NOINHERIT` means the login has no table rights of its own. Every transaction must pick a role.

## Roles and row-level security

`src/server/data/db.ts` wraps every query in `withDb(ctx, fn)`, which runs
`SET LOCAL ROLE` and, for companies, sets `app.company_id` from the session.

| Role | Highlights |
| --- | --- |
| `app_public` | Reads live packages, active companies (no licence numbers), published reviews, the calculated verification view. Can insert quote requests and consent records. Cannot read any quote request. |
| `app_company` | Row-level security limits every company table to `company_id = app.company_id`. Can edit own packages, read own quote requests, change only their `status`. No write access to verification. |
| `app_admin` | Writes verification records, moderates reviews, reads the audit log. Cannot read encrypted contact columns. |

## Rules enforced in the database

- Audit log and verification history are append-only (triggers block update, delete and truncate, even for the owner).
- "Verified" is calculated in the `company_verification` view: latest record is VERIFIED and today is before the licence expiry and before 12 months after the check.
- A consent record must name the same company as its quote request. A quote request's package must belong to the same company.
- Money is whole fils (AED x 100). Ratings 1 to 5. Real reviews need a quote request.

## Local setup

```
export MIGRATION_DATABASE_URL=postgresql://<owner>@localhost:5432/advisr
pnpm db:migrate
pnpm db:seed          # sample data only, refuses to run in production
pnpm db:check-drift   # schema.prisma matches the migrations
```

Access tests: `TEST_ADMIN_DATABASE_URL=postgresql://<superuser>@localhost:5432/postgres pnpm test:integration`
creates a throwaway `advisr_test` database. Never point it at a shared or production server.
