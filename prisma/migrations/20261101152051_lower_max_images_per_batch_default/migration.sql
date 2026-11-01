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
    "maxImagesPerBatch" INTEGER NOT NULL DEFAULT 15,
    "outputDirectory" TEXT NOT NULL DEFAULT '../data/outputs',
    "llmBaseUrl" TEXT,
    "llmModel" TEXT,
    "llmSystemPrompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("comfyBaseUrl", "createdAt", "defaultCfg", "defaultFixedSeed", "defaultHeight", "defaultSeedMode", "defaultSteps", "defaultWidth", "hasGatewayToken", "id", "llmBaseUrl", "llmModel", "llmSystemPrompt", "maxImagesPerBatch", "outputDirectory", "updatedAt") SELECT "comfyBaseUrl", "createdAt", "defaultCfg", "defaultFixedSeed", "defaultHeight", "defaultSeedMode", "defaultSteps", "defaultWidth", "hasGatewayToken", "id", "llmBaseUrl", "llmModel", "llmSystemPrompt", "maxImagesPerBatch", "outputDirectory", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Đồng bộ trần đã lưu về 15 cho các cài đặt đã có (@default chỉ áp dụng cho
-- row mới, nên nếu không UPDATE thì trần thực tế trên máy đang dùng vẫn là
-- giá trị cũ). Vẫn có thể hạ lại trong trang Cài đặt.
UPDATE "AppSettings" SET "maxImagesPerBatch" = 15;
