-- AlterTable
-- Catches up migration history with schema.prisma: these 6 columns back the
-- upscale feature (lib/images/upscale.ts) and were previously added straight
-- to the dev database via `prisma db push`, never captured as a migration --
-- so a fresh `migrate deploy` (as used to provision the packaged app's
-- template DB) was missing them, causing every Prisma read of GeneratedImage
-- to fail with P2022.
ALTER TABLE "GeneratedImage" ADD COLUMN "upscaleFormat" TEXT;
ALTER TABLE "GeneratedImage" ADD COLUMN "upscaleStatus" TEXT;
ALTER TABLE "GeneratedImage" ADD COLUMN "upscaledHeight" INTEGER;
ALTER TABLE "GeneratedImage" ADD COLUMN "upscaledMaskedRelativePath" TEXT;
ALTER TABLE "GeneratedImage" ADD COLUMN "upscaledRelativePath" TEXT;
ALTER TABLE "GeneratedImage" ADD COLUMN "upscaledWidth" INTEGER;
