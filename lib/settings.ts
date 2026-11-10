import { prisma } from "@/lib/db";
import type { AppSettings } from "@prisma/client";

// Áp dụng cấu hình mặc định từ biến môi trường nếu DB chưa có giá trị
export function applyEnvDefaults(
  row: AppSettings,
  env: Record<string, string | undefined> = process.env,
): AppSettings {
  const resolve = (dbVal: string | null, envKey: string): string | null => {
    if (dbVal !== null && dbVal.trim().length > 0) {
      return dbVal;
    }
    const envVal = env[envKey];
    if (envVal !== undefined && envVal.trim().length > 0) {
      return envVal.trim();
    }
    return dbVal;
  };

  return {
    ...row,
    runpodEndpointId: resolve(row.runpodEndpointId, "ANIMA_RUNPOD_ENDPOINT_ID"),
    runpodApiKey: resolve(row.runpodApiKey, "ANIMA_RUNPOD_API_KEY"),
    llmApiKey: resolve(row.llmApiKey, "ANIMA_LLM_API_KEY"),
    llmBaseUrl: resolve(row.llmBaseUrl, "ANIMA_LLM_BASE_URL"),
    llmModel: resolve(row.llmModel, "ANIMA_LLM_MODEL"),
  };
}

/**
 * AppSettings is a singleton row keyed by id "main". get-or-create here
 * means the row always exists after first access, without relying on a
 * startup migration/seed to have run successfully.
 */
export async function getOrCreateSettings(): Promise<AppSettings> {
  const existing = await prisma.appSettings.findUnique({ where: { id: "main" } });
  const row = existing ?? (await prisma.appSettings.create({ data: { id: "main" } }));
  return applyEnvDefaults(row);
}

export async function getOrCreateGlobalPrompt() {
  const existing = await prisma.globalPrompt.findUnique({ where: { id: "main" } });
  if (existing) return existing;
  return prisma.globalPrompt.create({ data: { id: "main" } });
}

export function redactSettings(settings: AppSettings) {
  return {
    runpodEndpointId: settings.runpodEndpointId,
    hasRunpodKey: Boolean(settings.runpodApiKey),
    defaultWidth: settings.defaultWidth,
    defaultHeight: settings.defaultHeight,
    defaultSteps: settings.defaultSteps,
    defaultCfg: settings.defaultCfg,
    defaultSeedMode: settings.defaultSeedMode,
    defaultFixedSeed: settings.defaultFixedSeed ? Number(settings.defaultFixedSeed) : null,
    maxImagesPerBatch: settings.maxImagesPerBatch,
    outputDirectory: settings.outputDirectory,
    autoPublish: settings.autoPublish,
    autoFormatId: settings.autoFormatId,
    advancedMode: settings.advancedMode,
    llmBaseUrl: settings.llmBaseUrl,
    llmModel: settings.llmModel,
    llmSystemPrompt: settings.llmSystemPrompt,
    hasLlmKey: Boolean(settings.llmApiKey),
    updatedAt: settings.updatedAt,
  };
}
