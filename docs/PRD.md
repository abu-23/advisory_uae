# PRD: MVP

## Goal
Let a person compare UAE service companies for three services (trade license, Ejari, visa services) with transparent prices and a clear Verified/Unverified label, and request a quote from one company.

## In scope (MVP)
1. **Pick services**: trade license, Ejari, visa services (multi-select).
2. **Quick questions**: emirate/zone (Dubai mainland, Dubai free zone, Abu Dhabi, other), number of visas, timing.
3. **Results**: list of matching packages. Each card: company name, package, year-1 total, renewal from year 2 ("Not stated" shown as a warning), turnaround, rating and verified-review count (or "No verified reviews yet"), price last updated, Verified (with check date) or Unverified label. Toggle "Verified only" (default off). Order: verified first, then lowest price.
4. **Company profile**: verification details (checked date, licence expiry), price breakdown (government fees indicative vs company fee), included/not included, verified reviews.
5. **Request a quote**: name + one contact method, consent checkbox naming the company, notice that no passport/Emirates ID/bank details are requested. Confirmation screen.
6. **Languages**: English and Arabic (RTL) for all customer screens.
7. **Company portal** (desktop): sign in with MFA, edit own packages and prices, see own quote requests (contact details only after consent), upload renewed licence.
8. **Admin**: verify companies (review licence copy, set Verified with check date and expiry), moderate reviews, audit log view.

## Out of scope for the MVP
Customer accounts, document uploads from customers, chat, payments, quote checker, scam-check tool, Google reviews, UAE PASS, native mobile apps. (Later phases.)

## Verified rules
- Only Admin sets Verified, server-side.
- Verified expires when the licence expires, or 12 months after the last check, whichever is first.
- Verified means the licence was checked on the official portal. It does not mean quality. The UI says so.

## Data model (draft)
- `Company`: id, name, emirate(s), licence_number, status
- `CompanyUser`: id, company_id, email, password_hash (Argon2id), mfa_secret (encrypted), role
- `AdminUser`: id, email, password_hash, mfa_secret, role
- `Package`: id, company_id, service_type, title, gov_fees, service_fee, renewal_fee (nullable), turnaround_days_min/max, includes[], excludes[], price_updated_at, status
- `VerificationRecord`: id, company_id, checked_at, licence_expires_at, checked_by, licence_doc_ref, status
- `QuoteRequest`: id, company_id, package_id, answers (json), contact_encrypted, status, created_at
- `ConsentRecord`: id, quote_request_id, company_id, policy_version, accepted_at
- `Review`: id, company_id, quote_request_id (must be completed), rating, text, status
- `AuditLog`: id, actor, action, target, at (no personal data, no secrets)

## Access rules (tests required)
- Company A can never read or modify Company B's packages, quote requests or documents.
- Contact details are returned to a company only if a ConsentRecord exists for that company.
- Provider and customer endpoints cannot write verification fields.
- Admin and company endpoints require MFA-verified sessions.

## Acceptance criteria highlights
- Public pages need no sign-up and collect no personal data until a quote request.
- Quote form is rate limited and bot protected.
- Arabic and English pages both pass RTL/LTR visual review.
- All prices show "last updated" date and are labelled as confirmed in the company's written quote.

## Seed data
Use the fake companies from the prototype (names marked "(sample)"). No real companies.
