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
});
