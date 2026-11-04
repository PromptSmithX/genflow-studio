import type { AppSettings } from "@prisma/client";

/**
 * Model gợi ý khi AppSettings.llmModel trống -- khớp mặc định LLM_MODEL ở Cell
 * 7.6 của notebook Colab (xem LUSTIFY_v10_Krea2_Turbo_INT8_Colab_Headless.ipynb).
 * Người cài Colab có thể đổi model khác qua biến môi trường LLM_MODEL ở đó; khi
 * đó nên cũng cập nhật AppSettings.llmModel trong Cài đặt cho khớp.
 */
export const DEFAULT_LLM_MODEL = "grok-4-fast-non-reasoning";

export interface ResolvedLlmConfig {
  baseUrl: string;
  model: string;
}

/**
 * Trợ lý AI KHÔNG còn cấu hình base URL/API key riêng -- LLM chạy qua cùng
 * gateway Colab với ComfyUI (route "/llm", xem Cell 8 trong notebook), key thật
 * chỉ nằm ở Colab (nhập bằng getpass, Cell 7.6) nên KHÔNG BAO GIỜ lộ ra
 * installer/GitHub. App chỉ cần `comfyBaseUrl` đã cấu hình ở trang Cài đặt và
 * KHÔNG gửi Authorization -- gateway tự chèn key thật phía server.
 * Trả null khi chưa cấu hình URL ComfyUI (Trợ lý AI phụ thuộc cùng tunnel).
 */
export function resolveLlmConfig(settings: AppSettings): ResolvedLlmConfig | null {
  if (!settings.comfyBaseUrl) return null;
  const baseUrl = `${settings.comfyBaseUrl.replace(/\/+$/, "")}/llm`;
  const model = settings.llmModel?.trim() || DEFAULT_LLM_MODEL;
  return { baseUrl, model };
}
