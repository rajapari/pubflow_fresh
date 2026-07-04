-- CreateEnum
CREATE TYPE "StyleManual" AS ENUM ('INHOUSE', 'APA7', 'CHICAGO17', 'AMA11', 'MLA9', 'VANCOUVER', 'IEEE', 'CSE', 'HARVARD');

-- CreateEnum
CREATE TYPE "TemplateSourceFormat" AS ENUM ('IDML', 'INDD', 'LATEX', 'PDF');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ProofCorrectionKind" AS ENUM ('INSERT', 'DELETE', 'REPLACE', 'MOVE', 'QUERY_ANSWER', 'COMMENT');

-- CreateEnum
CREATE TYPE "ProofCorrectionStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "ProofQueryStatus" AS ENUM ('OPEN', 'ANSWERED', 'RESOLVED');

-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'GRAPHICAL_ABSTRACT';

-- CreateTable
CREATE TABLE "proof_queries" (
    "id" TEXT NOT NULL,
    "proofReviewId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "raisedBy" TEXT,
    "question" TEXT NOT NULL,
    "page" INTEGER,
    "posX" DOUBLE PRECISION,
    "posY" DOUBLE PRECISION,
    "status" "ProofQueryStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proof_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_corrections" (
    "id" TEXT NOT NULL,
    "proofReviewId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "markedById" TEXT NOT NULL,
    "kind" "ProofCorrectionKind" NOT NULL,
    "page" INTEGER,
    "posX" DOUBLE PRECISION,
    "posY" DOUBLE PRECISION,
    "targetText" TEXT,
    "newText" TEXT,
    "note" TEXT,
    "status" "ProofCorrectionStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proof_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicationId" TEXT,
    "name" TEXT NOT NULL,
    "manual" "StyleManual" NOT NULL DEFAULT 'INHOUSE',
    "cslStyle" TEXT NOT NULL DEFAULT 'apa',
    "rulesetKey" TEXT,
    "promptKey" TEXT,
    "houseRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "style_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layout_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicationId" TEXT,
    "name" TEXT NOT NULL,
    "sourceFormat" "TemplateSourceFormat" NOT NULL,
    "targetEngine" "LayoutEngine" NOT NULL,
    "sourceMinioKey" TEXT NOT NULL,
    "generatedMinioKey" TEXT,
    "spec" JSONB NOT NULL DEFAULT '{}',
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layout_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proof_queries_proofReviewId_idx" ON "proof_queries"("proofReviewId");

-- CreateIndex
CREATE INDEX "proof_queries_submissionId_idx" ON "proof_queries"("submissionId");

-- CreateIndex
CREATE INDEX "proof_corrections_proofReviewId_idx" ON "proof_corrections"("proofReviewId");

-- CreateIndex
CREATE INDEX "proof_corrections_submissionId_idx" ON "proof_corrections"("submissionId");

-- CreateIndex
CREATE INDEX "style_profiles_tenantId_idx" ON "style_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "style_profiles_publicationId_idx" ON "style_profiles"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "style_profiles_tenantId_name_key" ON "style_profiles"("tenantId", "name");

-- CreateIndex
CREATE INDEX "layout_templates_tenantId_idx" ON "layout_templates"("tenantId");

-- CreateIndex
CREATE INDEX "layout_templates_publicationId_idx" ON "layout_templates"("publicationId");

-- AddForeignKey
ALTER TABLE "proof_queries" ADD CONSTRAINT "proof_queries_proofReviewId_fkey" FOREIGN KEY ("proofReviewId") REFERENCES "proof_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_corrections" ADD CONSTRAINT "proof_corrections_proofReviewId_fkey" FOREIGN KEY ("proofReviewId") REFERENCES "proof_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layout_templates" ADD CONSTRAINT "layout_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layout_templates" ADD CONSTRAINT "layout_templates_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "publications_tenantid_title_unique" RENAME TO "publications_tenantId_title_key";

