-- CreateTable
CREATE TABLE "GlobalPrompt" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "positivePrompt" TEXT NOT NULL DEFAULT '',
    "negativePrompt" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StylePreset" (
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
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "comfyBaseUrl" TEXT,
    "hasGatewayToken" BOOLEAN NOT NULL DEFAULT false,
    "defaultWidth" INTEGER NOT NULL DEFAULT 1024,
    "defaultHeight" INTEGER NOT NULL DEFAULT 1024,
    "defaultSteps" INTEGER NOT NULL DEFAULT 25,
    "defaultCfg" REAL NOT NULL DEFAULT 4.0,
    "defaultSeedMode" TEXT NOT NULL DEFAULT 'random',
    "defaultFixedSeed" BIGINT,
    "maxImagesPerBatch" INTEGER NOT NULL DEFAULT 8,
    "outputDirectory" TEXT NOT NULL DEFAULT 'data/outputs',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkflowConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "workflowRelativePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "nodeMappingJson" TEXT NOT NULL DEFAULT '{}',
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "validatedAt" DATETIME,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GenerationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ideaPrompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requestedCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "indexInBatch" INTEGER NOT NULL,
    "styleId" TEXT,
    "styleNameSnapshot" TEXT,
    "stylePositiveSnapshot" TEXT,
    "styleNegativeSnapshot" TEXT,
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
    CONSTRAINT "GenerationJob_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "StylePreset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedImage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StylePreset_name_key" ON "StylePreset"("name");

-- CreateIndex
CREATE INDEX "StylePreset_isActive_idx" ON "StylePreset"("isActive");

-- CreateIndex
CREATE INDEX "StylePreset_sortOrder_idx" ON "StylePreset"("sortOrder");

-- CreateIndex
CREATE INDEX "GenerationBatch_createdAt_idx" ON "GenerationBatch"("createdAt");

-- CreateIndex
CREATE INDEX "GenerationBatch_status_idx" ON "GenerationBatch"("status");

-- CreateIndex
CREATE INDEX "GenerationJob_batchId_idx" ON "GenerationJob"("batchId");

-- CreateIndex
CREATE INDEX "GenerationJob_status_idx" ON "GenerationJob"("status");

-- CreateIndex
CREATE INDEX "GenerationJob_styleId_idx" ON "GenerationJob"("styleId");

-- CreateIndex
CREATE INDEX "GenerationJob_promptId_idx" ON "GenerationJob"("promptId");

-- CreateIndex
CREATE INDEX "GeneratedImage_jobId_idx" ON "GeneratedImage"("jobId");

-- CreateIndex
CREATE INDEX "GeneratedImage_createdAt_idx" ON "GeneratedImage"("createdAt");
