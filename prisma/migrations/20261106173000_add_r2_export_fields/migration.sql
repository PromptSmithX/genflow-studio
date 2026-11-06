-- AlterTable
ALTER TABLE "GenerationBatch" ADD COLUMN "r2Error" TEXT;
ALTER TABLE "GenerationBatch" ADD COLUMN "r2Folder" TEXT;
ALTER TABLE "GenerationBatch" ADD COLUMN "r2PushedAt" DATETIME;
ALTER TABLE "GenerationBatch" ADD COLUMN "r2SkuBase" TEXT;
ALTER TABLE "GenerationBatch" ADD COLUMN "r2Status" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GenerationBatch_r2SkuBase_key" ON "GenerationBatch"("r2SkuBase");
