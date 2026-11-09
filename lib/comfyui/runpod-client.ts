// https://docs.runpod.io/serverless/endpoints/endpoint-api
import { z } from "zod";
import type { WorkflowApiJson } from "./workflow-mapper";
import { GenerationSetupError } from "@/lib/generations/errors";

export class RunpodApiError extends Error {
  constructor(
    message: string,
    public readonly code: "no_config" | "timeout" | "network" | "unauthorized" | "http_error" | "invalid_json",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "RunpodApiError";
  }
}

export type RunpodJobStatus =
  | "IN_QUEUE"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "NOT_FOUND";

export interface RunpodOutputImage {
  index: number;
  filename: string;
  key: string;
  masked_key: string | null;
  mask_status: "censored" | "clean" | "failed";
  width: number | null;
  height: number | null;
}

export interface RunpodJobResult {
  status: RunpodJobStatus;
  images: RunpodOutputImage[];
  error?: string;
}

export interface RunpodHealth {
  workers: Record<string, number>;
  jobs: Record<string, number>;
}

const runpodImageSchema = z.object({
  index: z.number(),
  filename: z.string(),
  key: z.string(),
  masked_key: z.string().nullable(),
  mask_status: z.enum(["censored", "clean", "failed"]),
  width: z.number().nullable().optional().transform((v) => v ?? null),
  height: z.number().nullable().optional().transform((v) => v ?? null),
});

const VALID_STATUSES = new Set<RunpodJobStatus>([
  "IN_QUEUE",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);

const DEFAULT_TIMEOUT_MS = 15_000;

export class RunpodClient {
  private readonly endpointId: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: { endpointId: string; apiKey: string; timeoutMs?: number }) {
    if (!options?.endpointId?.trim() || !options?.apiKey?.trim()) {
      throw new RunpodApiError("Chưa cấu hình RunPod (Endpoint ID + API key)", "no_config");
    }
    this.endpointId = options.endpointId.trim();
    this.apiKey = options.apiKey.trim();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseUrl = `https://api.runpod.ai/v2/${encodeURIComponent(this.endpointId)}`;
  }

  private async request(path: string, init?: RequestInit, timeoutMs?: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new RunpodApiError("Kết nối tới RunPod quá thời gian chờ (timeout)", "timeout");
      }
      throw new RunpodApiError("Không thể kết nối tới RunPod (network error)", "network", error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseJson(response: Response): Promise<unknown> {
    if (response.status === 401 || response.status === 403) {
      throw new RunpodApiError("RunPod API key không hợp lệ", "unauthorized");
    }

    const text = await response.text();
    if (!response.ok) {
      throw new RunpodApiError(`RunPod API trả lỗi HTTP ${response.status}`, "http_error", {
        status: response.status,
        body: text.slice(0, 500),
      });
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new RunpodApiError("Phản hồi từ RunPod không phải JSON hợp lệ", "invalid_json", {
        body: text.slice(0, 500),
      });
    }
  }

  async submitJob(workflow: WorkflowApiJson): Promise<{ jobId: string }> {
    const res = await this.request("/run", {
      method: "POST",
      body: JSON.stringify({ input: { workflow } }),
    });
    const data = (await this.parseJson(res)) as { id?: string };
    if (!data?.id) {
      throw new RunpodApiError("RunPod không trả về job ID", "invalid_json", data);
    }
    return { jobId: data.id };
  }

  async getJobResult(jobId: string): Promise<RunpodJobResult> {
    const res = await this.request(`/status/${encodeURIComponent(jobId)}`);
    if (res.status === 404) {
      return { status: "NOT_FOUND", images: [] };
    }
    if (res.status === 401 || res.status === 403) {
      throw new RunpodApiError("RunPod API key không hợp lệ", "unauthorized");
    }

    const text = await res.text();
    if (!res.ok) {
      throw new RunpodApiError(`RunPod API trả lỗi HTTP ${res.status}`, "http_error", {
        status: res.status,
        body: text.slice(0, 500),
      });
    }

    let data: { status?: RunpodJobStatus; output?: unknown; error?: unknown };
    try {
      data = JSON.parse(text);
    } catch {
      throw new RunpodApiError("Phản hồi từ RunPod không phải JSON hợp lệ", "invalid_json", {
        body: text.slice(0, 500),
      });
    }

    const output = data.output as { images?: unknown[]; error?: unknown } | undefined;
    const rawError = output?.error ?? data.error;
    const errorString = rawError
      ? typeof rawError === "string"
        ? rawError
        : JSON.stringify(rawError)
      : undefined;

    if (!data.status || !VALID_STATUSES.has(data.status as RunpodJobStatus)) {
      return { status: "NOT_FOUND", images: [], error: errorString };
    }

    let status = data.status as RunpodJobStatus;

    if (status === "COMPLETED" && errorString) {
      status = "FAILED";
    }

    if (status === "COMPLETED") {
      const images: RunpodOutputImage[] = [];
      if (Array.isArray(output?.images)) {
        for (const item of output.images) {
          const parsed = runpodImageSchema.safeParse(item);
          if (parsed.success) {
            images.push(parsed.data);
          }
        }
      }
      return { status: "COMPLETED", images };
    }

    return { status, images: [], error: errorString };
  }

  async health(): Promise<RunpodHealth> {
    const res = await this.request("/health");
    const data = (await this.parseJson(res)) as {
      workers?: Record<string, number>;
      jobs?: Record<string, number>;
    };
    return {
      workers: data?.workers ?? {},
      jobs: data?.jobs ?? {},
    };
  }
}

export function getRunpodClient(settings: {
  runpodEndpointId: string | null;
  runpodApiKey: string | null;
}): RunpodClient {
  if (!settings.runpodEndpointId?.trim() || !settings.runpodApiKey?.trim()) {
    throw new GenerationSetupError(
      "Chưa cấu hình RunPod (Endpoint ID + API key) — vào Cài đặt",
      "not_configured",
    );
  }
  return new RunpodClient({
    endpointId: settings.runpodEndpointId.trim(),
    apiKey: settings.runpodApiKey.trim(),
  });
}
