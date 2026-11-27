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

## Checks

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
