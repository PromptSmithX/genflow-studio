import { describe, expect, it, vi, afterEach } from "vitest";
import { LlmClient, LlmApiError } from "@/lib/llm/client";

function chatResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LlmClient", () => {
  it("throws no_config when baseUrl or model is missing", () => {
    expect(() => new LlmClient({ baseUrl: "", model: "" })).toThrow(LlmApiError);
    expect(() => new LlmClient({ baseUrl: "http://x", model: "" })).toThrow(LlmApiError);
  });

  it("returns parsed images/negative when the model's JSON matches expected count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        chatResponse({
          images: [
            { positive: "red hair, walking", caption: "Cô gái tóc đỏ đang đi bộ" },
            { positive: "red hair, sitting", caption: "Cô gái tóc đỏ đang ngồi" },
          ],
          negative: "extra limbs",
        }),
      ),
    );
    const client = new LlmClient({ baseUrl: "http://localhost:1234/v1", model: "test-model" });
    const result = await client.generatePrompts({ systemPrompt: "sys", userMessage: "user", expectedCount: 2 });
    expect(result.images).toHaveLength(2);
    expect(result.negative).toBe("extra limbs");
  });

  it("retries once and succeeds when the first reply has the wrong image count", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse({ images: [{ positive: "a", caption: "b" }], negative: "" }))
      .mockResolvedValueOnce(
        chatResponse({
          images: [
            { positive: "a", caption: "b" },
            { positive: "c", caption: "d" },
          ],
          negative: "",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new LlmClient({ baseUrl: "http://localhost:1234/v1", model: "test-model" });
    const result = await client.generatePrompts({ systemPrompt: "sys", userMessage: "user", expectedCount: 2 });
    expect(result.images).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws bad_shape when the image count is still wrong after the retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(chatResponse({ images: [{ positive: "a", caption: "b" }], negative: "" })),
    );
    const client = new LlmClient({ baseUrl: "http://localhost:1234/v1", model: "test-model" });
    await expect(
      client.generatePrompts({ systemPrompt: "sys", userMessage: "user", expectedCount: 3 }),
    ).rejects.toMatchObject({ code: "bad_shape" });
  });

  it("throws invalid_json when the model's content is not JSON, even after retrying", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
      }),
    );
    const client = new LlmClient({ baseUrl: "http://localhost:1234/v1", model: "test-model" });
    await expect(
      client.generatePrompts({ systemPrompt: "sys", userMessage: "user", expectedCount: 1 }),
    ).rejects.toMatchObject({ code: "invalid_json" });
  });

  it("throws http_error on a non-200 response without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "Internal Error" });
    vi.stubGlobal("fetch", fetchMock);
    const client = new LlmClient({ baseUrl: "http://localhost:1234/v1", model: "test-model" });
    await expect(
      client.generatePrompts({ systemPrompt: "sys", userMessage: "user", expectedCount: 1 }),
    ).rejects.toMatchObject({ code: "http_error" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws network on a fetch rejection without retrying", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const client = new LlmClient({ baseUrl: "http://localhost:1234/v1", model: "test-model" });
    await expect(
      client.generatePrompts({ systemPrompt: "sys", userMessage: "user", expectedCount: 1 }),
    ).rejects.toMatchObject({ code: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
