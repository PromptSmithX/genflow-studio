import { describe, expect, it, vi, afterEach } from "vitest";
import { RunpodClient, RunpodApiError, getRunpodClient } from "@/lib/comfyui/runpod-client";
import { GenerationSetupError } from "@/lib/generations/errors";
import type { WorkflowApiJson } from "@/lib/comfyui/workflow-mapper";

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

describe("RunpodClient", () => {
  it("throws no_config in constructor if endpointId or apiKey is missing", () => {
    expect(() => new RunpodClient({ endpointId: "", apiKey: "key" })).toThrowError(RunpodApiError);
    expect(() => new RunpodClient({ endpointId: "ep-1", apiKey: "" })).toThrowError(RunpodApiError);
    try {
      new RunpodClient({ endpointId: "", apiKey: "" });
    } catch (e) {
      expect(e).toBeInstanceOf(RunpodApiError);
      expect((e as RunpodApiError).code).toBe("no_config");
    }
  });

  it("getRunpodClient throws GenerationSetupError not_configured if settings are incomplete", () => {
    expect(() =>
      getRunpodClient({ runpodEndpointId: null, runpodApiKey: "key" }),
    ).toThrowError(GenerationSetupError);
    expect(() =>
      getRunpodClient({ runpodEndpointId: "ep-1", runpodApiKey: "" }),
    ).toThrowError(GenerationSetupError);
  });

  it("submits job with correct URL, header, body and returns jobId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ id: "job-rp-456", status: "IN_QUEUE" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new RunpodClient({ endpointId: "my-endpoint", apiKey: "secret-key" });
    const result = await client.submitJob({
      "1": { class_type: "KSampler", inputs: {} },
    } as unknown as WorkflowApiJson);

    expect(result.jobId).toBe("job-rp-456");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.runpod.ai/v2/my-endpoint/run",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          input: { workflow: { "1": { class_type: "KSampler", inputs: {} } } },
        }),
      }),
    );
  });

  it("getJobResult handles IN_QUEUE and IN_PROGRESS", async () => {
    mockFetchOnce({ text: async () => JSON.stringify({ id: "job-1", status: "IN_QUEUE" }) });
    const client = new RunpodClient({ endpointId: "ep-1", apiKey: "key-1" });
    const qRes = await client.getJobResult("job-1");
    expect(qRes.status).toBe("IN_QUEUE");
    expect(qRes.images).toEqual([]);

    mockFetchOnce({ text: async () => JSON.stringify({ id: "job-1", status: "IN_PROGRESS" }) });
    const pRes = await client.getJobResult("job-1");
    expect(pRes.status).toBe("IN_PROGRESS");
    expect(pRes.images).toEqual([]);
  });

  it("getJobResult parses COMPLETED with images", async () => {
    mockFetchOnce({
      text: async () =>
        JSON.stringify({
          id: "job-1",
          status: "COMPLETED",
          output: {
            images: [
              {
                index: 0,
                filename: "job-1_0.png",
                key: "runpod-out/job-1/0.png",
                masked_key: "runpod-out/job-1/0.masked.png",
                mask_status: "censored",
                width: 1024,
                height: 1536,
              },
              {
                invalid: "image",
              },
            ],
          },
        }),
    });
    const client = new RunpodClient({ endpointId: "ep-1", apiKey: "key-1" });
    const res = await client.getJobResult("job-1");
    expect(res.status).toBe("COMPLETED");
    expect(res.images).toHaveLength(1);
    expect(res.images[0]).toEqual({
      index: 0,
      filename: "job-1_0.png",
      key: "runpod-out/job-1/0.png",
      masked_key: "runpod-out/job-1/0.masked.png",
      mask_status: "censored",
      width: 1024,
      height: 1536,
    });
  });

  it("getJobResult treats COMPLETED with output.error as FAILED", async () => {
    mockFetchOnce({
      text: async () =>
        JSON.stringify({
          id: "job-1",
          status: "COMPLETED",
          output: {
            error: "Out of memory in VAE decode",
          },
        }),
    });
    const client = new RunpodClient({ endpointId: "ep-1", apiKey: "key-1" });
    const res = await client.getJobResult("job-1");
    expect(res.status).toBe("FAILED");
    expect(res.error).toBe("Out of memory in VAE decode");
  });

  it("getJobResult handles FAILED, CANCELLED, and TIMED_OUT", async () => {
    mockFetchOnce({
      text: async () =>
        JSON.stringify({
          id: "job-1",
          status: "FAILED",
          error: "Worker crashed",
        }),
    });
    const client = new RunpodClient({ endpointId: "ep-1", apiKey: "key-1" });
    const res = await client.getJobResult("job-1");
    expect(res.status).toBe("FAILED");
    expect(res.error).toBe("Worker crashed");

    mockFetchOnce({
      text: async () =>
        JSON.stringify({
          id: "job-1",
          status: "CANCELLED",
        }),
    });
    const cancelRes = await client.getJobResult("job-1");
    expect(cancelRes.status).toBe("CANCELLED");

    mockFetchOnce({
      text: async () =>
        JSON.stringify({
          id: "job-1",
          status: "TIMED_OUT",
          error: "Job execution timed out",
        }),
    });
    const timeoutRes = await client.getJobResult("job-1");
    expect(timeoutRes.status).toBe("TIMED_OUT");
    expect(timeoutRes.error).toBe("Job execution timed out");
  });

  it("returns NOT_FOUND on HTTP 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => "Not Found",
      }),
    );
    const client = new RunpodClient({ endpointId: "ep-1", apiKey: "key-1" });
    const res = await client.getJobResult("job-expired");
    expect(res.status).toBe("NOT_FOUND");
    expect(res.images).toEqual([]);
  });

  it("throws unauthorized on HTTP 401 and 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => "Unauthorized",
      }),
    );
    const client = new RunpodClient({ endpointId: "ep-1", apiKey: "bad-key" });
    await expect(client.getJobResult("job-1")).rejects.toMatchObject({
      code: "unauthorized",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
        text: async () => "Forbidden",
      }),
    );
    await expect(client.health()).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("throws timeout on AbortError", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const client = new RunpodClient({ endpointId: "ep-1", apiKey: "key-1" });
    await expect(client.health()).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("health() calls /health and parses workers and jobs stats", async () => {
    mockFetchOnce({
      text: async () =>
        JSON.stringify({
          workers: { idle: 2, running: 1 },
          jobs: { inQueue: 0, inProgress: 1 },
        }),
    });
    const client = new RunpodClient({ endpointId: "ep-1", apiKey: "key-1" });
    const health = await client.health();
    expect(health.workers).toEqual({ idle: 2, running: 1 });
    expect(health.jobs).toEqual({ inQueue: 0, inProgress: 1 });
  });
});
