import { describe, expect, it } from "vitest";
import { settingsUpdateSchema } from "@/lib/validations/settings";

describe("settingsUpdateSchema", () => {
  it("allows empty string or whitespace-only for runpodEndpointId", () => {
    const emptyResult = settingsUpdateSchema.safeParse({ runpodEndpointId: "" });
    expect(emptyResult.success).toBe(true);

    const spaceResult = settingsUpdateSchema.safeParse({ runpodEndpointId: "   " });
    expect(spaceResult.success).toBe(true);
    if (spaceResult.success) {
      expect(spaceResult.data.runpodEndpointId).toBe("");
    }
  });

  it("allows null and valid alphanumeric-hyphen runpodEndpointId", () => {
    const nullResult = settingsUpdateSchema.safeParse({ runpodEndpointId: null });
    expect(nullResult.success).toBe(true);

    const validResult = settingsUpdateSchema.safeParse({ runpodEndpointId: "vllm-endpoint-123" });
    expect(validResult.success).toBe(true);
  });

  it("rejects invalid characters in runpodEndpointId like spaces", () => {
    const invalidResult = settingsUpdateSchema.safeParse({ runpodEndpointId: "abc 123" });
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.issues[0]?.message).toBe("Endpoint ID không hợp lệ");
    }

    const specialCharResult = settingsUpdateSchema.safeParse({ runpodEndpointId: "abc@123" });
    expect(specialCharResult.success).toBe(false);
  });

  it("validates llmBaseUrl: empty string, null, or valid URL is allowed, invalid URL is rejected", () => {
    const emptyResult = settingsUpdateSchema.safeParse({ llmBaseUrl: "" });
    expect(emptyResult.success).toBe(true);

    const nullResult = settingsUpdateSchema.safeParse({ llmBaseUrl: null });
    expect(nullResult.success).toBe(true);

    const validResult = settingsUpdateSchema.safeParse({ llmBaseUrl: "https://api.x.ai/v1" });
    expect(validResult.success).toBe(true);

    const invalidResult = settingsUpdateSchema.safeParse({ llmBaseUrl: "not a url" });
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.issues[0]?.message).toBe("URL không hợp lệ");
    }
  });

  it("validates llmApiKey: string, empty string, or null is allowed", () => {
    expect(settingsUpdateSchema.safeParse({ llmApiKey: "xai-test-key" }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ llmApiKey: "" }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ llmApiKey: null }).success).toBe(true);
  });
});
