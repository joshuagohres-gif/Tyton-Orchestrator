-- CreateTable
CREATE TABLE "ComponentLibrary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mpn" TEXT NOT NULL,
    "category" TEXT,
    "value" TEXT,
    "symbol" TEXT,
    "footprint" TEXT,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ComponentLibrary_mpn_key" ON "ComponentLibrary"("mpn");

-- CreateIndex
CREATE INDEX "ComponentLibrary_category_idx" ON "ComponentLibrary"("category");
