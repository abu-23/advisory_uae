-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('TRADE_LICENSE', 'EJARI', 'VISA');

-- CreateEnum
CREATE TYPE "Location" AS ENUM ('DUBAI_MAINLAND', 'DUBAI_FREE_ZONE', 'ABU_DHABI', 'OTHER_EMIRATE');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'LIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('NEW', 'REPLIED', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locations" "Location"[],
    "licence_number" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "service_types" "ServiceType"[],
    "locations" "Location"[],
    "title_en" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "gov_fees_fils" INTEGER NOT NULL,
    "service_fee_fils" INTEGER NOT NULL,
    "renewal_fee_fils" INTEGER,
    "renewal_period_months" INTEGER,
    "visas_min" INTEGER NOT NULL DEFAULT 0,
    "visas_max" INTEGER NOT NULL DEFAULT 0,
    "turnaround_days_min" INTEGER NOT NULL,
    "turnaround_days_max" INTEGER NOT NULL,
    "includes_en" TEXT[],
    "includes_ar" TEXT[],
    "excludes_en" TEXT[],
    "excludes_ar" TEXT[],
    "price_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_record" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,
    "licence_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "checked_by" UUID NOT NULL,
    "licence_doc_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licence_document" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_by" UUID NOT NULL,
    "delete_after" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licence_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_version" (
    "version" TEXT NOT NULL,
    "text_en" TEXT NOT NULL,
    "text_ar" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "policy_version_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "quote_request" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "contact_name_enc" BYTEA NOT NULL,
    "contact_value_enc" BYTEA NOT NULL,
    "contact_type" "ContactType" NOT NULL,
    "key_id" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delete_after" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" UUID NOT NULL,
    "quote_request_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "policy_version" TEXT NOT NULL,
    "consent_text_hash" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(3),

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "quote_request_id" UUID,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "request_id" TEXT,
    "metadata" JSONB,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_slug_key" ON "company"("slug");

-- CreateIndex
CREATE INDEX "package_company_id_idx" ON "package"("company_id");

-- CreateIndex
CREATE INDEX "package_status_idx" ON "package"("status");

-- CreateIndex
CREATE INDEX "verification_record_company_id_checked_at_idx" ON "verification_record"("company_id", "checked_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "licence_document_storage_key_key" ON "licence_document"("storage_key");

-- CreateIndex
CREATE INDEX "licence_document_company_id_idx" ON "licence_document"("company_id");

-- CreateIndex
CREATE INDEX "quote_request_company_id_created_at_idx" ON "quote_request"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "quote_request_delete_after_idx" ON "quote_request"("delete_after");

-- CreateIndex
CREATE UNIQUE INDEX "consent_record_quote_request_id_key" ON "consent_record"("quote_request_id");

-- CreateIndex
CREATE INDEX "consent_record_company_id_idx" ON "consent_record"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_quote_request_id_key" ON "review"("quote_request_id");

-- CreateIndex
CREATE INDEX "review_company_id_status_idx" ON "review"("company_id", "status");

-- CreateIndex
CREATE INDEX "audit_log_target_type_target_id_idx" ON "audit_log"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- AddForeignKey
ALTER TABLE "package" ADD CONSTRAINT "package_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_record" ADD CONSTRAINT "verification_record_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_record" ADD CONSTRAINT "verification_record_licence_doc_id_fkey" FOREIGN KEY ("licence_doc_id") REFERENCES "licence_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licence_document" ADD CONSTRAINT "licence_document_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request" ADD CONSTRAINT "quote_request_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request" ADD CONSTRAINT "quote_request_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_policy_version_fkey" FOREIGN KEY ("policy_version") REFERENCES "policy_version"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
