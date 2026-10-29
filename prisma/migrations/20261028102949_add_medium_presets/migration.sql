-- CreateTable
CREATE TABLE "MediumPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "positivePrompt" TEXT NOT NULL DEFAULT '',
    "negativePrompt" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MediumPreset_name_key" ON "MediumPreset"("name");

-- CreateIndex
CREATE INDEX "MediumPreset_isActive_idx" ON "MediumPreset"("isActive");

-- CreateIndex
CREATE INDEX "MediumPreset_sortOrder_idx" ON "MediumPreset"("sortOrder");
