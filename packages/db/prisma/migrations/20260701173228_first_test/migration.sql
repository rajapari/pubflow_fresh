-- CreateEnum
CREATE TYPE "CopyEditStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REVISION_REQUESTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ManuscriptFormat" ADD VALUE 'PDF';
ALTER TYPE "ManuscriptFormat" ADD VALUE 'ZIP';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PROOF_READER';

-- AlterTable
ALTER TABLE "publications" ADD COLUMN     "reviewerInstructions" TEXT,
ADD COLUMN     "submissionGuidelines" TEXT;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "lastReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "doi" TEXT;

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "crossrefLoginId" TEXT,
ADD COLUMN     "crossrefLoginPassword" TEXT,
ADD COLUMN     "enablePrintOnDemand" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "luluClientKey" TEXT,
ADD COLUMN     "luluClientSecret" TEXT,
ADD COLUMN     "luluPodPackageId" TEXT,
ADD COLUMN     "pmcFtpHost" TEXT,
ADD COLUMN     "pmcFtpPassword" TEXT,
ADD COLUMN     "pmcFtpPath" TEXT,
ADD COLUMN     "pmcFtpUsername" TEXT;

-- CreateTable
CREATE TABLE "copy_edits" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "status" "CopyEditStatus" NOT NULL DEFAULT 'ASSIGNED',
    "editedKey" TEXT,
    "comments" TEXT,
    "editorNotes" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copy_edits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "copy_edits_submissionId_idx" ON "copy_edits"("submissionId");

-- CreateIndex
CREATE INDEX "reviews_status_dueAt_idx" ON "reviews"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "copy_edits" ADD CONSTRAINT "copy_edits_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_edits" ADD CONSTRAINT "copy_edits_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
