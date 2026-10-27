-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "comfyBaseUrl" TEXT,
    "hasGatewayToken" BOOLEAN NOT NULL DEFAULT false,
    "defaultWidth" INTEGER NOT NULL DEFAULT 1024,
    "defaultHeight" INTEGER NOT NULL DEFAULT 1024,
    "defaultSteps" INTEGER NOT NULL DEFAULT 25,
    "defaultCfg" REAL NOT NULL DEFAULT 4.0,
    "defaultSeedMode" TEXT NOT NULL DEFAULT 'random',
    "defaultFixedSeed" BIGINT,
    "maxImagesPerBatch" INTEGER NOT NULL DEFAULT 20,
    "outputDirectory" TEXT NOT NULL DEFAULT 'data/outputs',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("comfyBaseUrl", "createdAt", "defaultCfg", "defaultFixedSeed", "defaultHeight", "defaultSeedMode", "defaultSteps", "defaultWidth", "hasGatewayToken", "id", "maxImagesPerBatch", "outputDirectory", "updatedAt") SELECT "comfyBaseUrl", "createdAt", "defaultCfg", "defaultFixedSeed", "defaultHeight", "defaultSeedMode", "defaultSteps", "defaultWidth", "hasGatewayToken", "id", "maxImagesPerBatch", "outputDirectory", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
