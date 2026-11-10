import { describe, expect, it } from "vitest";
import { redactSettings } from "@/lib/settings";
import type { AppSettings } from "@prisma/client";

describe("redactSettings", () => {
  const dummySettings = {
    id: "main",
    runpodEndpointId: "test-ep-123",
    runpodApiKey: "rpa-secret-key-123",
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
    llmBaseUrl: "https://api.x.ai/v1",
    llmApiKey: "xai-secret-key-456",
    llmModel: "grok-4-fast-non-reasoning",
    llmSystemPrompt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as AppSettings;

  it("never exposes llmApiKey or runpodApiKey", () => {
    const redacted = redactSettings(dummySettings);
    expect((redacted as Record<string, unknown>).llmApiKey).toBeUndefined();
    expect((redacted as Record<string, unknown>).runpodApiKey).toBeUndefined();
    expect(JSON.stringify(redacted)).not.toContain("xai-secret-key-456");
    expect(JSON.stringify(redacted)).not.toContain("rpa-secret-key-123");
  });

  it("exposes llmBaseUrl", () => {
    const redacted = redactSettings(dummySettings);
    expect(redacted.llmBaseUrl).toBe("https://api.x.ai/v1");
  });

  it("determines hasLlmKey strictly based on llmApiKey", () => {
    const withLlmKey = redactSettings({
      ...dummySettings,
      llmApiKey: "xai-real-key",
    });
    expect(withLlmKey.hasLlmKey).toBe(true);

    const withoutLlmKey = redactSettings({
      ...dummySettings,
      llmApiKey: null,
    });
    expect(withoutLlmKey.hasLlmKey).toBe(false);

    const withEmptyLlmKey = redactSettings({
      ...dummySettings,
      llmApiKey: "",
    });
    expect(withEmptyLlmKey.hasLlmKey).toBe(false);
  });
});
