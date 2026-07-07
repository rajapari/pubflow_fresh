-- Publishers: the publishing house a journal/book belongs to.
-- Wizard cascades publisher → journal; storage folders derive from this tree.
CREATE TABLE "publishers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "publishers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "publishers_tenantId_name_key" ON "publishers"("tenantId", "name");
CREATE INDEX "publishers_tenantId_idx" ON "publishers"("tenantId");

ALTER TABLE "publishers" ADD CONSTRAINT "publishers_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publications" ADD COLUMN "publisherId" TEXT;
CREATE INDEX "publications_publisherId_idx" ON "publications"("publisherId");
ALTER TABLE "publications" ADD CONSTRAINT "publications_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "publishers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
