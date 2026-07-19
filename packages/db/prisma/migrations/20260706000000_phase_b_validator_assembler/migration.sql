-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "compileError" TEXT,
ADD COLUMN     "compiledAt" TIMESTAMP(3),
ADD COLUMN     "compiledPdfKey" TEXT;

-- AlterTable
ALTER TABLE "outputs" ADD COLUMN     "validationReport" JSONB;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "issueOrder" INTEGER;

