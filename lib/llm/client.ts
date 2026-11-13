import { ZodError } from "zod";
import {
  llmSuggestionResultSchema,
  type LlmSuggestionResult,
  type SuggestPromptsResponse,
  type TokenUsage,
} from "@/lib/validations/llm";

export class LlmApiError extends Error {
  constructor(
    message: string,
    public readonly code: "no_config" | "timeout" | "network" | "http_error" | "invalid_json" | "bad_shape",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "LlmApiError";
  }
}

interface LlmClientOptions {
  baseUrl: string;
  apiKey?: string | null;
  model: string;
  timeoutMs?: number;
}

export interface GeneratePromptsInput {
  systemPrompt: string;
  userMessage: string;
  expectedCount: number;
}

// grok-build và các model nặng có thể sinh nhiều prompt chậm hơn 60s; để trần
// cao hơn tránh bị huỷ sớm (biểu hiện là lỗi 502 code=timeout ở /suggest).
const DEFAULT_TIMEOUT_MS = 180_000;

// Thin server-only client for any OpenAI-compatible Chat Completions endpoint.
export class LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string | null;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: LlmClientOptions) {
    if (!options.baseUrl || !options.model) {
      throw new LlmApiError("Chưa cấu hình LLM (base URL / model)", "no_config");
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async chatCompletion(
    systemPrompt: string,
    userMessage: string,
    { temperature = 1, timeoutMs = this.timeoutMs }: { temperature?: number; timeoutMs?: number } = {},
  ): Promise<{ content: string; usage: TokenUsage | null }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          response_format: { type: "json_object" },
          temperature,
          top_p: 1,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new LlmApiError("Kết nối tới LLM quá thời gian chờ (timeout)", "timeout");
      }
      throw new LlmApiError("Không thể kết nối tới LLM (network error)", "network", error);
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new LlmApiError(`LLM trả lỗi HTTP ${response.status}`, "http_error", {
        status: response.status,
        body: text.slice(0, 500),
      });
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LlmApiError("Phản hồi từ LLM không phải JSON hợp lệ", "invalid_json", { body: text.slice(0, 500) });
    }

    const parsedJson = json as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = parsedJson.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new LlmApiError("Phản hồi LLM thiếu nội dung trả lời", "invalid_json", json);
    }
    const usage: TokenUsage | null = parsedJson.usage
      ? {
          promptTokens: parsedJson.usage.prompt_tokens ?? null,
          completionTokens: parsedJson.usage.completion_tokens ?? null,
          totalTokens: parsedJson.usage.total_tokens ?? null,
        }
      : null;
    return { content, usage };
  }

  /** Một lượt gọi trả JSON tuỳ ý (không retry); người gọi tự kiểm tra shape. */
  async completeJson(
    systemPrompt: string,
    userMessage: string,
    options: { temperature?: number; timeoutMs?: number } = {},
  ): Promise<unknown> {
    const { content } = await this.chatCompletion(systemPrompt, userMessage, options);
    try {
      return JSON.parse(content);
    } catch {
      throw new LlmApiError("LLM không trả về JSON hợp lệ", "invalid_json", { content: content.slice(0, 500) });
    }
  }

  private parseResult(content: string, expectedCount: number): LlmSuggestionResult {
    let candidate: unknown;
    try {
      candidate = JSON.parse(content);
    } catch {
      throw new LlmApiError("LLM không trả về JSON hợp lệ", "invalid_json", { content: content.slice(0, 500) });
    }

    const parsed = llmSuggestionResultSchema.parse(candidate);
    if (parsed.images.length !== expectedCount) {
      throw new LlmApiError(
        `LLM trả về ${parsed.images.length} ảnh, cần đúng ${expectedCount}`,
        "bad_shape",
        parsed,
      );
    }
    const empty = parsed.images.findIndex((image) => !image.positive && !image.scene && !image.woman && !image.man);
    if (empty >= 0) {
      throw new LlmApiError(`LLM trả ảnh #${empty + 1} không có nội dung prompt`, "bad_shape", parsed);
    }
    return parsed;
  }

  /**
   * Generates per-image positive prompts + captions and one shared negative
   * prompt. Retries once (same request) if the model returns malformed JSON
   * or the wrong number of images, since LLM output is inherently variable.
   */
  async generatePrompts({ systemPrompt, userMessage, expectedCount }: GeneratePromptsInput): Promise<SuggestPromptsResponse> {
    try {
      const { content, usage } = await this.chatCompletion(systemPrompt, userMessage);
      return { ...this.parseResult(content, expectedCount), usage };
    } catch (error) {
      if (!(error instanceof LlmApiError && (error.code === "invalid_json" || error.code === "bad_shape")) &&
        !(error instanceof ZodError)) {
        throw error;
      }
      const { content, usage } = await this.chatCompletion(systemPrompt, userMessage);
      return { ...this.parseResult(content, expectedCount), usage };
    }
  }
}
