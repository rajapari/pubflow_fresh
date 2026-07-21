-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'CC_BY_NC_ND', 'CC_BY_ND', 'CC0', 'ALL_RIGHTS_RESERVED');

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "coiStatement" TEXT,
ADD COLUMN     "complianceReport" JSONB,
ADD COLUMN     "copyrightAgreedAt" TIMESTAMP(3),
ADD COLUMN     "dataAvailabilityReport" JSONB,
ADD COLUMN     "dataAvailabilityStatement" TEXT,
ADD COLUMN     "ethicsStatement" TEXT,
ADD COLUMN     "fundingStatement" TEXT,
ADD COLUMN     "licenseType" "LicenseType",
ADD COLUMN     "trialRegistrationNumber" TEXT;

