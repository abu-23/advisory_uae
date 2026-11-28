# Advisr UAE

Compare UAE business service companies (trade license, Ejari, visa services) in English and Arabic.

Read `CLAUDE.md` for rules and `docs/PRD.md` for scope. `prototype/` is reference only.

## Run locally

1. Node 22 and pnpm 10 (`corepack enable`).
2. `cp .env.example .env` and fill in real local values. Never commit `.env`.
   - `SESSION_SECRET`: at least 32 random characters.
   - `FIELD_ENCRYPTION_KEY`: 32 random bytes, base64 (`openssl rand -base64 32`).
3. `pnpm install`
4. `pnpm dev`

The server refuses to start if a required value is missing or still a placeholder.

## Run on your own computer (Windows, Mac or Linux)

You need three free programs: Git, Node.js 22 (LTS) and Docker Desktop (start it and wait until it says it is running).

```
git clone https://github.com/abu-23/advisory_uae.git
cd advisory_uae
npm install -g pnpm@10.28.0
pnpm install
pnpm local:setup
pnpm dev
```

`pnpm local:setup` starts a local database and Redis in Docker, creates a `.env` with fresh random secrets, adds sample data and creates one superadmin account. It prints that account's one-time password once. Then open http://localhost:3000/en or http://localhost:3000/ar. The sign-in page is at `/en/sign-in`. Stop the app with Ctrl+C. Stop the database with `docker compose down` (add `-v` to wipe it). The Docker passwords are throwaway and only for your own computer.

## Accounts

There is no public sign-up. Accounts are created by an operator:

```
pnpm user:create --role admin --email name@example.com --name "Name"
pnpm user:create --role company --email name@example.com --name "Name" --company-slug <slug>
```

It prints a one-time random password once. Every account must set up an authenticator app (MFA) before it can reach any protected API. Roles: visitor (no account), company user, admin, superadmin. The sign-in and MFA screens are Phase 1; Phase 0 ships the sign-in API and protected endpoints under `/api/v1`.

## Checks

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`

## CI

Every pull request runs `.github/workflows/ci.yml`:

| Job | What it checks |
| --- | --- |
| Lint, types, tests, build | Code quality, unit tests, production build, and that the app refuses to start without settings |
| Database | Migrations apply, schema has no drift, seed works and refuses production, access tests (row-level security, roles, append-only audit log) |
| Secret scan | gitleaks over the full Git history |
| Dependency scan | `pnpm audit` (high/critical fail) and osv-scanner on the lockfile |
| Code scan | Semgrep (JavaScript, TypeScript, React, OWASP Top 10, secrets rules) |

Actions are pinned to exact commits. Dependabot proposes weekly updates for packages and actions.
Trivy container scanning is added when the project gets a Dockerfile.
