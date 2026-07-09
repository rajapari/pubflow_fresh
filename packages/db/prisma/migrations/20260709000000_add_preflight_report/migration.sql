-- Preflight Bot report (PDF/X conformance, embedded fonts, trim/bleed boxes).
-- NULL until the bot runs against a PDF_PRINT output.
ALTER TABLE "outputs" ADD COLUMN "preflightReport" JSONB;
