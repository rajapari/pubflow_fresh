-- AlterTable
ALTER TABLE "publications" ADD COLUMN     "apcAmountCents" INTEGER,
ADD COLUMN     "apcCurrency" TEXT NOT NULL DEFAULT 'usd';

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "apcReport" JSONB;
