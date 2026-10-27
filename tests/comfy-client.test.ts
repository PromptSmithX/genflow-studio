import { describe, expect, it, vi, afterEach } from "vitest";
import { ComfyClient, ComfyApiError } from "@/lib/comfyui/client";

function mockFetchOnce(response: Partial<Response> & { text: () => Promise<string> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      ...response,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ComfyClient", () => {
  it("parses /system_stats 200 JSON", async () => {
    mockFetchOnce({ text: async () => JSON.stringify({ system: { comfyui_version: "1.0" } }) });
    const client = new ComfyClient({ baseUrl: "http://localhost:8188" });
    const stats = await client.getSystemStats();
    expect(stats.system?.comfyui_version).toBe("1.0");
  });

  it("returns a prompt id from /prompt", async () => {
    mockFetchOnce({ text: async () => JSON.stringify({ prompt_id: "abc-123" }) });
    const client = new ComfyClient({ baseUrl: "http://localhost:8188" });
    const result = await client.submitPrompt({});
    expect(result.promptId).toBe("abc-123");
  });

  it("throws ComfyApiError with code node_errors when /prompt reports node errors", async () => {
    mockFetchOnce({
      text: async () => JSON.stringify({ node_errors: { "6": { errors: ["bad input"] } } }),
    });
    const client = new ComfyClient({ baseUrl: "http://localhost:8188" });
    await expect(client.submitPrompt({})).rejects.toMatchObject({ code: "node_errors" });
  });

  it("throws ComfyApiError with code http_error on non-200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "Bad Gateway",
      }),
    );
    const client = new ComfyClient({ baseUrl: "http://localhost:8188" });
    await expect(client.getSystemStats()).rejects.toBeInstanceOf(ComfyApiError);
    await expect(client.getSystemStats()).rejects.toMatchObject({ code: "http_error" });
  });

  it("detects an HTML interstitial instead of crashing on JSON.parse", async () => {
    mockFetchOnce({
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<!doctype html><html><body>Tunnel reminder</body></html>",
    });
    const client = new ComfyClient({ baseUrl: "http://localhost:8188" });
    await expect(client.getSystemStats()).rejects.toMatchObject({ code: "html_interstitial" });
  });

  it("parses image metadata from /history/{prompt_id}", async () => {
    mockFetchOnce({
      text: async () =>
        JSON.stringify({
          "prompt-1": {
            status: { status_str: "success" },
            outputs: {
              "9": { images: [{ filename: "out.png", subfolder: "", type: "output" }] },
            },
          },
        }),
    });
    const client = new ComfyClient({ baseUrl: "http://localhost:8188" });
    const history = await client.getHistory("prompt-1");
    expect(history.status).toBe("completed");
    expect(history.images).toEqual([{ filename: "out.png", subfolder: "", type: "output" }]);
  });

  it("downloads binary data from /view", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => bytes,
      }),
    );
    const client = new ComfyClient({ baseUrl: "http://localhost:8188" });
    const buffer = await client.viewImage({ filename: "out.png", subfolder: "", type: "output" });
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("detects an HTML interstitial on /view instead of returning it as image bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => "<!doctype html><html><body>Tunnel reminder</body></html>",
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );
    const client = new ComfyClient({ baseUrl: "http://localhost:8188" });
    await expect(
      client.viewImage({ filename: "out.png", subfolder: "", type: "output" }),
    ).rejects.toMatchObject({ code: "html_interstitial" });
  });

  it("throws no_url error when base URL is missing", () => {
    expect(() => new ComfyClient({ baseUrl: "" })).toThrow(ComfyApiError);
  });
});
