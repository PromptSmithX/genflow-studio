export const DEFAULT_LLM_BASE_URL = "https://api.x.ai/v1";
export const DEFAULT_LLM_MODEL = "grok-4-fast-non-reasoning";

export interface ResolvedLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// Cấu hình kết nối LLM trực tiếp tới nhà cung cấp (mặc định xAI).
export function resolveLlmConfig(settings: {
  llmBaseUrl: string | null;
  llmApiKey: string | null;
  llmModel: string | null;
}): ResolvedLlmConfig | null {
  if (!settings.llmApiKey?.trim()) return null;
  const baseUrl = (settings.llmBaseUrl?.trim() || DEFAULT_LLM_BASE_URL).replace(/\/+$/, "");
  const apiKey = settings.llmApiKey.trim();
  const model = settings.llmModel?.trim() || DEFAULT_LLM_MODEL;
  return { baseUrl, apiKey, model };
}
