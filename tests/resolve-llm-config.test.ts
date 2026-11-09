import { describe, expect, it } from "vitest";
import {
  resolveLlmConfig,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
} from "@/lib/llm/resolve-config";

describe("resolveLlmConfig", () => {
  it("returns null when apiKey is missing, null, or empty string", () => {
    expect(
      resolveLlmConfig({
        llmBaseUrl: "https://api.x.ai/v1",
        llmApiKey: null,
        llmModel: "grok-4-fast-non-reasoning",
      }),
    ).toBeNull();

    expect(
      resolveLlmConfig({
        llmBaseUrl: "https://api.x.ai/v1",
        llmApiKey: "",
        llmModel: "grok-4-fast-non-reasoning",
      }),
    ).toBeNull();

    expect(
      resolveLlmConfig({
        llmBaseUrl: "https://api.x.ai/v1",
        llmApiKey: "   ",
        llmModel: "grok-4-fast-non-reasoning",
      }),
    ).toBeNull();
  });

  it("uses DEFAULT_LLM_BASE_URL when baseUrl is empty or null", () => {
    const configNullUrl = resolveLlmConfig({
      llmBaseUrl: null,
      llmApiKey: "test-api-key",
      llmModel: null,
    });
    expect(configNullUrl).toEqual({
      baseUrl: DEFAULT_LLM_BASE_URL,
      apiKey: "test-api-key",
      model: DEFAULT_LLM_MODEL,
    });

    const configEmptyUrl = resolveLlmConfig({
      llmBaseUrl: "   ",
      llmApiKey: "test-api-key",
      llmModel: null,
    });
    expect(configEmptyUrl?.baseUrl).toBe(DEFAULT_LLM_BASE_URL);
  });

  it("strips trailing slashes from baseUrl", () => {
    const config = resolveLlmConfig({
      llmBaseUrl: "https://api.example.com/v1///",
      llmApiKey: "test-key",
      llmModel: "custom-model",
    });
    expect(config?.baseUrl).toBe("https://api.example.com/v1");
  });

  it("uses DEFAULT_LLM_MODEL when model is empty or null, and preserves custom trimmed model", () => {
    const configDefault = resolveLlmConfig({
      llmBaseUrl: "https://api.x.ai/v1",
      llmApiKey: "test-key",
      llmModel: "  ",
    });
    expect(configDefault?.model).toBe(DEFAULT_LLM_MODEL);

    const configCustom = resolveLlmConfig({
      llmBaseUrl: "https://api.x.ai/v1",
      llmApiKey: "test-key",
      llmModel: "  gpt-4o-mini  ",
    });
    expect(configCustom?.model).toBe("gpt-4o-mini");
  });

  it("resolves default baseUrl when llmBaseUrl is null or empty", () => {
    const inputNull = {
      llmBaseUrl: null,
      llmApiKey: "test-key",
      llmModel: null,
    };
    const inputEmpty = {
      llmBaseUrl: "",
      llmApiKey: "test-key",
      llmModel: null,
    };
    expect(resolveLlmConfig(inputNull)).toEqual(resolveLlmConfig(inputEmpty));
    expect(resolveLlmConfig(inputNull)?.baseUrl).toBe(DEFAULT_LLM_BASE_URL);
  });
});
