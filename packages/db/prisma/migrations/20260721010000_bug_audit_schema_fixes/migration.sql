-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_tenantId_fkey";

-- CreateIndex
CREATE INDEX "copy_edits_editorId_idx" ON "copy_edits"("editorId");

-- CreateIndex
CREATE INDEX "editorial_decisions_submissionId_idx" ON "editorial_decisions"("submissionId");

-- CreateIndex
CREATE INDEX "issues_publicationId_idx" ON "issues"("publicationId");

-- CreateIndex
CREATE INDEX "reviews_reviewerId_idx" ON "reviews"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_tenantId_doi_key" ON "submissions"("tenantId", "doi");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

