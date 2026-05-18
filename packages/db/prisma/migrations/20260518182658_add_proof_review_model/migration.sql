-- CreateEnum
CREATE TYPE "ProofReviewStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'NEEDS_REVISION', 'SUBMITTED');

-- CreateTable
CREATE TABLE "proof_reviews" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "outputId" TEXT,
    "reviewerId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "status" "ProofReviewStatus" NOT NULL DEFAULT 'OPEN',
    "comments" TEXT,
    "annotations" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proof_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proof_reviews_submissionId_idx" ON "proof_reviews"("submissionId");

-- AddForeignKey
ALTER TABLE "proof_reviews" ADD CONSTRAINT "proof_reviews_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_reviews" ADD CONSTRAINT "proof_reviews_outputId_fkey" FOREIGN KEY ("outputId") REFERENCES "outputs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_reviews" ADD CONSTRAINT "proof_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
