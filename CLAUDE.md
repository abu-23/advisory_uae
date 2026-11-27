# Advisr UAE: UAE services comparison marketplace

Claude Code reads this file at the start of every session. Follow it.

## What we are building
A mobile-first web app (Arabic/English, RTL) where a person in the UAE picks the business services they need (trade license, Ejari, visa services), answers a few questions, and sees matching service companies with price, what's included, renewal cost, turnaround, verified reviews and a Verified/Unverified label. They can request a quote from one company. Companies manage their own packages and see their own quote requests.

Prototype reference: `prototype/` (layout and copy only, not production code). Full scope: `docs/PRD.md`.

## Workflow (do not skip steps)
1. Plan first (plan mode). Show the plan and wait for approval.
2. Build in small steps, one feature per branch, one PR per feature.
3. Every PR passes the Definition of Done below.
4. Never start a new phase without the owner saying so.

## Priorities, in order
1. Security and data protection. 2. Scalability. 3. Correctness. 4. Speed of delivery.
If a request from the owner conflicts with 1 or 2, say so, explain the risk, and propose a safer option before doing anything.
Never claim the app is "fully secure". State what was checked, what was not, and what needs independent verification.

## Proposed stack (confirm with the owner before scaffolding)
- Next.js (App Router) + TypeScript, server-side logic in route handlers or a separate NestJS API if we split later
- PostgreSQL + Prisma (migrations committed), Redis for rate limiting and sessions
- i18n: next-intl, English + Arabic, RTL via logical CSS properties
- Validation: zod on every server input
- Tests: Vitest (unit), Playwright (end-to-end)
- CI: GitHub Actions with gitleaks, dependency audit (npm audit + osv-scanner), CodeQL or Semgrep, Trivy for containers
- Hosting: AWS UAE region (me-central-1), decided by the owner. Data-residency requirements to be confirmed by a local legal advisor. Check that every AWS service we use is available in that region.

## Roles and access (enforced on the server for every request)
| Role | Can |
|---|---|
| Visitor (no account) | Browse services, companies, prices, reviews. Submit a quote request with consent. |
| Company user | Read/edit only their own company's packages and prices. Read only quote requests addressed to their company, and only after consent. Reply to those requests. |
| Admin (verification staff) | Review licence documents, set/clear the Verified badge, moderate reviews. MFA required. |
| Superadmin | Manage admins. MFA required. |

- Check authorization on every request, including object-level checks (a company can never read or change another company's data: prevent IDOR).
- The `verified` fields (status, checked_at, licence_expires_at, checked_by) are writable only by Admin, only server-side, and every change goes to the audit log.
- Admin routes are protected on the server, never just hidden in the UI.

## Data rules
- Collect the minimum. MVP collects: name and one contact method for a quote request. No passports, Emirates IDs, bank details or document uploads from customers in the MVP.
- Company licence copies (uploaded by companies for verification) are encrypted at rest, readable only by Admin, never shown to other companies, with a retention rule.
- Contact details in a quote request are encrypted at the field level. They are released to a company only after a stored consent record for that company.
- Each quote request stores a consent record (what was agreed, company, timestamp, policy version).
- Reviews: only from customers with a completed job through the platform. Do not scrape or store Google reviews.
- Retention and deletion: propose a default (12 months for quote requests) and flag it for legal review. Provide delete/export paths.
- Audit log for admin actions and access to sensitive records. Never log secrets or personal data.

## Security checklist (apply to every design, code review and release)
Secrets and configuration
- No API keys, tokens or credentials in code, client bundles, prompts or Git. Never read or print `.env`.
- Secrets live in a secrets manager or environment variables. `.env` is git-ignored. `.env.example` has placeholders only. Validate required env vars at startup.
- Separate dev/staging/prod configs and keys. Rotate any key that was ever exposed.
- Debug mode, verbose errors and stack traces off in production.
- Scan Git history for leaked secrets (gitleaks or trufflehog). Rotate anything found.

Authentication and access control
- Passwords hashed with Argon2id (or bcrypt with a proper cost). Never reversible.
- Prefer OAuth2/OIDC. MFA for admins, company users and sensitive actions. UAE PASS where relevant (later phase).
- Short-lived tokens, secure session handling, safe logout and token revocation.
- RBAC and least privilege for users, services, database roles and cloud IAM.

Input, output and API security
- Validate and sanitize all input on the server. Parameterized queries only.
- XSS: output encoding, no unsafe HTML injection, strict CSP.
- CSRF protection where cookies are used. Strict CORS allowlist.
- Rate limiting and lockout on login, OTP, quote requests and APIs. Bot protection on public forms.
- APIs authenticated, schema-validated and versioned. No mass assignment.
- Safe file uploads (type/size checks, malware scan, stored outside the web root).
- Security headers: HSTS, CSP, X-Content-Type-Options, frame-ancestors, Referrer-Policy, Permissions-Policy.
- HTTPS/TLS everywhere. Secure, HttpOnly, SameSite cookies.

Data and database
- Database never publicly exposed. Private network, least-privilege DB users.
- Encryption in transit and at rest. Field-level encryption for highly sensitive data.
- Encrypted, tested backups. Data residency respected.

Dependencies and hygiene
- Keep dependencies updated. Automated vulnerability scanning in CI. Pin versions. Commit lockfiles.
- Remove unused packages, routes, endpoints, test data and default accounts.
- Nothing exposed in production: `.git`, `.env`, backups, source maps, admin/debug panels.

Process
- Before launch: SAST, dependency and secret scanning in CI, a full audit against this list, and a third-party penetration test.
- Incident response and breach-notification plan. Monitoring and alerting in production.
- New items the owner adds go here and apply from then on.

## Definition of Done (every PR)
- [ ] Feature matches `docs/PRD.md` and the prototype
- [ ] Server-side authorization and input validation for every new endpoint
- [ ] Tests added (including a test that one company cannot access another's data, where relevant)
- [ ] English and Arabic strings, RTL checked
- [ ] No secrets, no real personal data, no real company names in code or seed data
- [ ] CI green: lint, types, tests, secret scan, dependency scan, SAST
- [ ] PR description lists what was checked, what was not, and anything needing independent verification

## Things we do not do
- No scraping of Google reviews or government portals without written confirmation that it is allowed.
- No customer document uploads in the MVP.
- No "Trusted / Not trusted" labels. Use "Verified / Unverified" only, with the check date.
- No paid placement that changes default ranking. Any sponsored slot must be clearly labelled.
- No real company names in seed data. Use obviously fake names marked "(sample)".

## Items to verify with a local legal advisor before launch
UAE PDPL obligations and consent wording; data residency and cross-border transfer; whether operating a referral/marketplace platform needs a licence; rules on referral fees or commissions from companies; free-zone rules on third-party promotion; advertising rules; wording of the Verified label and disclaimers; use of company names and logos with written permission.

## How to work with the owner
Keep explanations short and plain. Ask one question at a time when something blocks you. If something looks unsafe, stop and say so.
