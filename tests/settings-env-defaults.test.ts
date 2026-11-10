import { describe, expect, it } from "vitest";
import { applyEnvDefaults, redactSettings } from "@/lib/settings";
import type { AppSettings } from "@prisma/client";

describe("applyEnvDefaults", () => {
  const baseSettings = {
    id: "main",
    runpodEndpointId: null,
    runpodApiKey: null,
    defaultWidth: 1024,
    defaultHeight: 1024,
    defaultSteps: 25,
    defaultCfg: 4.0,
    defaultSeedMode: "random",
    defaultFixedSeed: null,
    maxImagesPerBatch: 15,
    outputDirectory: "outputs",
    autoPublish: true,
    autoFormatId: "premade_wall_11x8_5",
    advancedMode: false,
    llmBaseUrl: null,
    llmApiKey: null,
    llmModel: null,
    llmSystemPrompt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as AppSettings;

  it("(1) DB rong + env co -> lay env", () => {
    const env = {
      ANIMA_RUNPOD_ENDPOINT_ID: "ep-test-123",
      ANIMA_RUNPOD_API_KEY: "rpa-test-key-abc",
      ANIMA_LLM_API_KEY: "llm-test-key-xyz",
      ANIMA_LLM_BASE_URL: "https://api.test.ai/v1",
      ANIMA_LLM_MODEL: "test-model-turbo",
    };

    const result = applyEnvDefaults(baseSettings, env);
    expect(result.runpodEndpointId).toBe("ep-test-123");
    expect(result.runpodApiKey).toBe("rpa-test-key-abc");
    expect(result.llmApiKey).toBe("llm-test-key-xyz");
    expect(result.llmBaseUrl).toBe("https://api.test.ai/v1");
    expect(result.llmModel).toBe("test-model-turbo");
  });

  it("(2) DB co -> DB thang", () => {
    const dbSettings = {
      ...baseSettings,
      runpodEndpointId: "db-ep-456",
      runpodApiKey: "db-rpa-key",
      llmApiKey: "db-llm-key",
      llmBaseUrl: "https://db.provider.com/v1",
      llmModel: "db-custom-model",
    };

    const env = {
      ANIMA_RUNPOD_ENDPOINT_ID: "env-ep-999",
      ANIMA_RUNPOD_API_KEY: "env-rpa-key",
      ANIMA_LLM_API_KEY: "env-llm-key",
      ANIMA_LLM_BASE_URL: "https://env.provider.com/v1",
      ANIMA_LLM_MODEL: "env-model",
    };

    const result = applyEnvDefaults(dbSettings, env);
    expect(result.runpodEndpointId).toBe("db-ep-456");
    expect(result.runpodApiKey).toBe("db-rpa-key");
    expect(result.llmApiKey).toBe("db-llm-key");
    expect(result.llmBaseUrl).toBe("https://db.provider.com/v1");
    expect(result.llmModel).toBe("db-custom-model");
  });

  it("(3) env rong hoac chi khoang trang -> giu null", () => {
    const env = {
      ANIMA_RUNPOD_ENDPOINT_ID: "   ",
      ANIMA_RUNPOD_API_KEY: "",
      ANIMA_LLM_API_KEY: " \t ",
      ANIMA_LLM_BASE_URL: "",
      ANIMA_LLM_MODEL: "   ",
    };

    const result = applyEnvDefaults(baseSettings, env);
    expect(result.runpodEndpointId).toBeNull();
    expect(result.runpodApiKey).toBeNull();
    expect(result.llmApiKey).toBeNull();
    expect(result.llmBaseUrl).toBeNull();
    expect(result.llmModel).toBeNull();
  });

  it("(4) redactSettings(applyEnvDefaults(...)) khong chua chuoi key gia", () => {
    const env = {
      ANIMA_RUNPOD_ENDPOINT_ID: "ep-secret-demo",
      ANIMA_RUNPOD_API_KEY: "rpa-fake-secret-value-12345",
      ANIMA_LLM_API_KEY: "xai-fake-secret-value-67890",
      ANIMA_LLM_BASE_URL: "https://api.test.ai/v1",
      ANIMA_LLM_MODEL: "test-model",
    };

    const resolved = applyEnvDefaults(baseSettings, env);
    const redacted = redactSettings(resolved);

    expect(redacted.hasRunpodKey).toBe(true);
    expect(redacted.hasLlmKey).toBe(true);
    expect(redacted.runpodEndpointId).toBe("ep-secret-demo");

    const jsonStr = JSON.stringify(redacted);
    expect(jsonStr).not.toContain("rpa-fake-secret-value-12345");
    expect(jsonStr).not.toContain("xai-fake-secret-value-67890");
  });
});
