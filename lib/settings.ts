import { prisma } from "@/lib/db";
import type { AppSettings } from "@prisma/client";

/**
 * AppSettings is a singleton row keyed by id "main". get-or-create here
 * means the row always exists after first access, without relying on a
 * startup migration/seed to have run successfully.
 */
export async function getOrCreateSettings(): Promise<AppSettings> {
  const existing = await prisma.appSettings.findUnique({ where: { id: "main" } });
  if (existing) return existing;
  return prisma.appSettings.create({ data: { id: "main" } });
}

export async function getOrCreateGlobalPrompt() {
  const existing = await prisma.globalPrompt.findUnique({ where: { id: "main" } });
  if (existing) return existing;
  return prisma.globalPrompt.create({ data: { id: "main" } });
}

export function redactSettings(settings: AppSettings) {
  return {
    comfyBaseUrl: settings.comfyBaseUrl,
    hasGatewayToken: Boolean(process.env.COMFY_GATEWAY_TOKEN),
    defaultWidth: settings.defaultWidth,
    defaultHeight: settings.defaultHeight,
    defaultSteps: settings.defaultSteps,
    defaultCfg: settings.defaultCfg,
    defaultSeedMode: settings.defaultSeedMode,
    defaultFixedSeed: settings.defaultFixedSeed ? Number(settings.defaultFixedSeed) : null,
    maxImagesPerBatch: settings.maxImagesPerBatch,
    outputDirectory: settings.outputDirectory,
    updatedAt: settings.updatedAt,
  };
}
