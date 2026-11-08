-- AlterTable
ALTER TABLE "GenerationBatch" ADD COLUMN "autoError" TEXT;
ALTER TABLE "GenerationBatch" ADD COLUMN "autoFinishedAt" DATETIME;
ALTER TABLE "GenerationBatch" ADD COLUMN "autoStatus" TEXT;
ALTER TABLE "GenerationBatch" ADD COLUMN "sheetSyncedAt" DATETIME;

UPDATE "GenerationBatch" SET "autoStatus" = 'legacy';

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
    "outputDirectory" TEXT NOT NULL DEFAULT 'outputs',
    "autoPublish" BOOLEAN NOT NULL DEFAULT true,
    "autoFormatId" TEXT NOT NULL DEFAULT 'premade_wall_11x8_5',
    "llmBaseUrl" TEXT,
    "llmModel" TEXT,
    "llmSystemPrompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("comfyBaseUrl", "createdAt", "defaultCfg", "defaultFixedSeed", "defaultHeight", "defaultSeedMode", "defaultSteps", "defaultWidth", "hasGatewayToken", "id", "llmBaseUrl", "llmModel", "llmSystemPrompt", "maxImagesPerBatch", "outputDirectory", "updatedAt") SELECT "comfyBaseUrl", "createdAt", "defaultCfg", "defaultFixedSeed", "defaultHeight", "defaultSeedMode", "defaultSteps", "defaultWidth", "hasGatewayToken", "id", "llmBaseUrl", "llmModel", "llmSystemPrompt", "maxImagesPerBatch", "outputDirectory", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
CREATE TABLE "new_GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "indexInBatch" INTEGER NOT NULL,
    "styleId" TEXT,
    "styleNameSnapshot" TEXT,
    "stylePositiveSnapshot" TEXT,
    "styleNegativeSnapshot" TEXT,
    "sceneId" TEXT,
    "sceneNameSnapshot" TEXT,
    "scenePositiveSnapshot" TEXT,
    "sceneNegativeSnapshot" TEXT,
    "poseId" TEXT,
    "poseNameSnapshot" TEXT,
    "posePositiveSnapshot" TEXT,
    "poseNegativeSnapshot" TEXT,
    "ideaPromptSnapshot" TEXT NOT NULL,
    "positiveFinal" TEXT NOT NULL,
    "negativeFinal" TEXT NOT NULL,
    "overlaySpecJson" TEXT,
    "promptId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "seed" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "steps" INTEGER,
    "cfg" REAL,
    "sampler" TEXT,
    "scheduler" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "autoRetryCount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GenerationBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GenerationJob_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "StylePreset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GenerationJob_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "ScenePreset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GenerationJob_poseId_fkey" FOREIGN KEY ("poseId") REFERENCES "PosePreset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GenerationJob" ("batchId", "cfg", "createdAt", "errorCode", "errorMessage", "finishedAt", "height", "id", "ideaPromptSnapshot", "indexInBatch", "negativeFinal", "overlaySpecJson", "poseId", "poseNameSnapshot", "poseNegativeSnapshot", "posePositiveSnapshot", "positiveFinal", "promptId", "sampler", "sceneId", "sceneNameSnapshot", "sceneNegativeSnapshot", "scenePositiveSnapshot", "scheduler", "seed", "startedAt", "status", "steps", "styleId", "styleNameSnapshot", "styleNegativeSnapshot", "stylePositiveSnapshot", "submittedAt", "updatedAt", "width") SELECT "batchId", "cfg", "createdAt", "errorCode", "errorMessage", "finishedAt", "height", "id", "ideaPromptSnapshot", "indexInBatch", "negativeFinal", "overlaySpecJson", "poseId", "poseNameSnapshot", "poseNegativeSnapshot", "posePositiveSnapshot", "positiveFinal", "promptId", "sampler", "sceneId", "sceneNameSnapshot", "sceneNegativeSnapshot", "scenePositiveSnapshot", "scheduler", "seed", "startedAt", "status", "steps", "styleId", "styleNameSnapshot", "styleNegativeSnapshot", "stylePositiveSnapshot", "submittedAt", "updatedAt", "width" FROM "GenerationJob";
DROP TABLE "GenerationJob";
ALTER TABLE "new_GenerationJob" RENAME TO "GenerationJob";
CREATE INDEX "GenerationJob_batchId_idx" ON "GenerationJob"("batchId");
CREATE INDEX "GenerationJob_status_idx" ON "GenerationJob"("status");
CREATE INDEX "GenerationJob_styleId_idx" ON "GenerationJob"("styleId");
CREATE INDEX "GenerationJob_sceneId_idx" ON "GenerationJob"("sceneId");
CREATE INDEX "GenerationJob_poseId_idx" ON "GenerationJob"("poseId");
CREATE INDEX "GenerationJob_promptId_idx" ON "GenerationJob"("promptId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
