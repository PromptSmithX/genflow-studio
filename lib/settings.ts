import { prisma } from "@/lib/db";
import type { AppSettings } from "@prisma/client";

// Ánh xạ giữa tên thuộc tính cấu hình và biến môi trường tương ứng
export const MANAGED_FIELD_ENV_MAP = {
  runpodEndpointId: "ANIMA_RUNPOD_ENDPOINT_ID",
  runpodApiKey: "ANIMA_RUNPOD_API_KEY",
  llmApiKey: "ANIMA_LLM_API_KEY",
  llmBaseUrl: "ANIMA_LLM_BASE_URL",
  llmModel: "ANIMA_LLM_MODEL",
} as const;

export type ManagedField = keyof typeof MANAGED_FIELD_ENV_MAP;

// Lấy danh sách các trường được cấu hình qua biến môi trường khác rỗng
export function getManagedFields(
  env: Record<string, string | undefined> = process.env,
): ManagedField[] {
  const fields: ManagedField[] = [];
  for (const [field, envKey] of Object.entries(MANAGED_FIELD_ENV_MAP) as [ManagedField, string][]) {
    const val = env[envKey];
    if (val !== undefined && val.trim().length > 0) {
      fields.push(field);
    }
  }
  return fields;
}

// Bỏ các trường được cấu hình qua biến môi trường để không ghi đè vào DB
export function omitManagedFields<T extends Record<string, unknown>>(
  body: T,
  managed: (ManagedField | string)[] = getManagedFields(),
): T {
  const result = { ...body };
  for (const field of managed) {
    delete (result as Record<string, unknown>)[field];
  }
  return result;
}

// Key nhúng từ biến môi trường luôn thắng DB nếu khác rỗng sau trim
export function applyEnvDefaults(
  row: AppSettings,
  env: Record<string, string | undefined> = process.env,
): AppSettings {
  const resolve = (dbVal: string | null, envKey: string): string | null => {
    const envVal = env[envKey];
    if (envVal !== undefined && envVal.trim().length > 0) {
      return envVal.trim();
    }
    return dbVal;
  };

  return {
    ...row,
    runpodEndpointId: resolve(row.runpodEndpointId, MANAGED_FIELD_ENV_MAP.runpodEndpointId),
    runpodApiKey: resolve(row.runpodApiKey, MANAGED_FIELD_ENV_MAP.runpodApiKey),
    llmApiKey: resolve(row.llmApiKey, MANAGED_FIELD_ENV_MAP.llmApiKey),
    llmBaseUrl: resolve(row.llmBaseUrl, MANAGED_FIELD_ENV_MAP.llmBaseUrl),
    llmModel: resolve(row.llmModel, MANAGED_FIELD_ENV_MAP.llmModel),
  };
}

export const applyManagedSettings = applyEnvDefaults;

// Lấy hoặc khởi tạo cấu hình singleton với id "main"
export async function getOrCreateSettings(): Promise<AppSettings> {
  const existing = await prisma.appSettings.findUnique({ where: { id: "main" } });
  const row = existing ?? (await prisma.appSettings.create({ data: { id: "main" } }));
  return applyEnvDefaults(row);
}

// Lấy hoặc khởi tạo cấu hình prompt toàn cục
export async function getOrCreateGlobalPrompt() {
  const existing = await prisma.globalPrompt.findUnique({ where: { id: "main" } });
  if (existing) return existing;
  return prisma.globalPrompt.create({ data: { id: "main" } });
}

// Ẩn secret và đính kèm danh sách trường được quản lý
export function redactSettings(
  settings: AppSettings,
  env: Record<string, string | undefined> = process.env,
) {
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
    managedFields: getManagedFields(env),
    updatedAt: settings.updatedAt,
  };
}
