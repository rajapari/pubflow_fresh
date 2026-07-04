-- Prevent duplicate publications per tenant (same title twice in same tenant)
ALTER TABLE "publications" ADD CONSTRAINT "publications_tenantid_title_unique" UNIQUE ("tenantId", "title");
