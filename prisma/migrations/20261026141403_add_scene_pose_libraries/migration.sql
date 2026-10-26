-- CreateTable
CREATE TABLE "ScenePreset" (
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

-- CreateTable
CREATE TABLE "PosePreset" (
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

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
INSERT INTO "new_GenerationJob" ("batchId", "cfg", "createdAt", "errorCode", "errorMessage", "finishedAt", "height", "id", "ideaPromptSnapshot", "indexInBatch", "negativeFinal", "positiveFinal", "promptId", "sampler", "scheduler", "seed", "startedAt", "status", "steps", "styleId", "styleNameSnapshot", "styleNegativeSnapshot", "stylePositiveSnapshot", "submittedAt", "updatedAt", "width") SELECT "batchId", "cfg", "createdAt", "errorCode", "errorMessage", "finishedAt", "height", "id", "ideaPromptSnapshot", "indexInBatch", "negativeFinal", "positiveFinal", "promptId", "sampler", "scheduler", "seed", "startedAt", "status", "steps", "styleId", "styleNameSnapshot", "styleNegativeSnapshot", "stylePositiveSnapshot", "submittedAt", "updatedAt", "width" FROM "GenerationJob";
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

-- CreateIndex
CREATE UNIQUE INDEX "ScenePreset_name_key" ON "ScenePreset"("name");

-- CreateIndex
CREATE INDEX "ScenePreset_isActive_idx" ON "ScenePreset"("isActive");

-- CreateIndex
CREATE INDEX "ScenePreset_sortOrder_idx" ON "ScenePreset"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PosePreset_name_key" ON "PosePreset"("name");

-- CreateIndex
CREATE INDEX "PosePreset_isActive_idx" ON "PosePreset"("isActive");

-- CreateIndex
CREATE INDEX "PosePreset_sortOrder_idx" ON "PosePreset"("sortOrder");
