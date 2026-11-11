import { describe, expect, it } from "vitest";
import {
  applyEnvDefaults,
  getManagedFields,
  omitManagedFields,
  redactSettings,
} from "@/lib/settings";
import type { AppSettings } from "@prisma/client";

describe("applyEnvDefaults & managed settings", () => {
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

  it("(2) DB co + env co -> env thang DB", () => {
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
    expect(result.runpodEndpointId).toBe("env-ep-999");
    expect(result.runpodApiKey).toBe("env-rpa-key");
    expect(result.llmApiKey).toBe("env-llm-key");
    expect(result.llmBaseUrl).toBe("https://env.provider.com/v1");
    expect(result.llmModel).toBe("env-model");
  });

  it("(3) env rong hoac chi khoang trang -> giu DB", () => {
    const dbSettings = {
      ...baseSettings,
      runpodEndpointId: "db-ep-456",
      runpodApiKey: "db-rpa-key",
      llmApiKey: "db-llm-key",
      llmBaseUrl: "https://db.provider.com/v1",
      llmModel: "db-custom-model",
    };

    const env = {
      ANIMA_RUNPOD_ENDPOINT_ID: "   ",
      ANIMA_RUNPOD_API_KEY: "",
      ANIMA_LLM_API_KEY: " \t ",
      ANIMA_LLM_BASE_URL: "",
      ANIMA_LLM_MODEL: "   ",
    };

    const result = applyEnvDefaults(dbSettings, env);
    expect(result.runpodEndpointId).toBe("db-ep-456");
    expect(result.runpodApiKey).toBe("db-rpa-key");
    expect(result.llmApiKey).toBe("db-llm-key");
    expect(result.llmBaseUrl).toBe("https://db.provider.com/v1");
    expect(result.llmModel).toBe("db-custom-model");
  });

  it("(4) getManagedFields tra ve dung danh sach field co env khac rong", () => {
    const env = {
      ANIMA_RUNPOD_ENDPOINT_ID: "ep-123",
      ANIMA_RUNPOD_API_KEY: "   ",
      ANIMA_LLM_API_KEY: "llm-key-abc",
      ANIMA_LLM_MODEL: "model-x",
    };

    const managed = getManagedFields(env);
    expect(managed).toEqual(["runpodEndpointId", "llmApiKey", "llmModel"]);
  });

  it("(5) redactSettings co managedFields va JSON.stringify khong chua key gia", () => {
    const env = {
      ANIMA_RUNPOD_ENDPOINT_ID: "ep-secret-demo",
      ANIMA_RUNPOD_API_KEY: "rpa-fake-secret-value-12345",
      ANIMA_LLM_API_KEY: "xai-fake-secret-value-67890",
      ANIMA_LLM_BASE_URL: "https://api.test.ai/v1",
      ANIMA_LLM_MODEL: "test-model",
    };

    const resolved = applyEnvDefaults(baseSettings, env);
    const redacted = redactSettings(resolved, env);

    expect(redacted.hasRunpodKey).toBe(true);
    expect(redacted.hasLlmKey).toBe(true);
    expect(redacted.runpodEndpointId).toBe("ep-secret-demo");
    expect(redacted.managedFields).toEqual([
      "runpodEndpointId",
      "runpodApiKey",
      "llmApiKey",
      "llmBaseUrl",
      "llmModel",
    ]);

    const jsonStr = JSON.stringify(redacted);
    expect(jsonStr).not.toContain("rpa-fake-secret-value-12345");
    expect(jsonStr).not.toContain("xai-fake-secret-value-67890");
  });

  it("(6) omitManagedFields bo dung cac field managed ke ca null", () => {
    const body = {
      runpodEndpointId: "ep-override",
      runpodApiKey: null,
      llmApiKey: "new-key",
      llmBaseUrl: "https://new.base.url",
      llmModel: "new-model",
      llmSystemPrompt: "custom prompt",
      defaultWidth: 512,
    };

    const omitted = omitManagedFields(body, ["runpodEndpointId", "runpodApiKey", "llmApiKey"]);
    expect(omitted).toEqual({
      llmBaseUrl: "https://new.base.url",
      llmModel: "new-model",
      llmSystemPrompt: "custom prompt",
      defaultWidth: 512,
    });
    expect("runpodEndpointId" in omitted).toBe(false);
    expect("runpodApiKey" in omitted).toBe(false);
    expect("llmApiKey" in omitted).toBe(false);
  });
});
