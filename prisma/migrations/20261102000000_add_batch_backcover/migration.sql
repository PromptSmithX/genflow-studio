-- AlterTable
ALTER TABLE "GenerationBatch" ADD COLUMN "backCoverRelativePath" TEXT;
ALTER TABLE "GenerationBatch" ADD COLUMN "backCoverStatus" TEXT;
ALTER TABLE "GenerationBatch" ADD COLUMN "backCoverFormat" TEXT;
ALTER TABLE "GenerationBatch" ADD COLUMN "backCoverWidth" INTEGER;
ALTER TABLE "GenerationBatch" ADD COLUMN "backCoverHeight" INTEGER;
