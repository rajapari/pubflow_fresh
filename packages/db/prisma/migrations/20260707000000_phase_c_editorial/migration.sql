-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "rebuttalReport" JSONB,
ADD COLUMN     "screeningReport" JSONB,
ADD COLUMN     "similarityReport" JSONB;

