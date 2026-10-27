import type { WorkflowApiJson } from "./workflow-mapper";

export class ComfyApiError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "no_url"
      | "timeout"
      | "network"
      | "html_interstitial"
      | "http_error"
      | "node_errors"
      | "invalid_json",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ComfyApiError";
  }
}

export interface SystemStats {
  system?: { comfyui_version?: string; os?: string };
  devices?: { name?: string; vram_total?: number; vram_free?: number }[];
}

export interface SubmitPromptResult {
  promptId: string;
}

export interface HistoryImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

export interface HistoryEntry {
  status: "completed" | "running" | "not_found";
  images: HistoryImageRef[];
}

interface ComfyClientOptions {
  baseUrl: string;
  token?: string | null;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Thin server-only wrapper around the ComfyUI HTTP API. Every call runs on
 * the Next.js server, never in the browser. Detects LocalTunnel HTML
 * interstitials and other non-JSON responses explicitly instead of
 * crashing on JSON.parse, since those are a distinct, common failure mode.
 */
export class ComfyClient {
  private readonly baseUrl: string;
  private readonly token?: string | null;
  private readonly timeoutMs: number;

  constructor(options: ComfyClientOptions) {
    if (!options.baseUrl) {
      throw new ComfyApiError("ComfyUI base URL chưa được cấu hình", "no_url");
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "bypass-tunnel-reminder": "1",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init?.headers ?? {}) },
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ComfyApiError("Kết nối tới ComfyUI quá thời gian chờ (timeout)", "timeout");
      }
      throw new ComfyApiError("Không thể kết nối tới ComfyUI (network error)", "network", error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseJson(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (contentType.includes("text/html") || /^\s*<!doctype html/i.test(text)) {
      throw new ComfyApiError(
        "Nhận được trang HTML thay vì phản hồi API — tunnel có thể đã hết hạn hoặc cần xác nhận interstitial",
        "html_interstitial",
      );
    }

    if (!response.ok) {
      throw new ComfyApiError(
        `ComfyUI trả lỗi HTTP ${response.status}`,
        "http_error",
        { status: response.status, body: text.slice(0, 500) },
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new ComfyApiError("Phản hồi từ ComfyUI không phải JSON hợp lệ", "invalid_json", {
        body: text.slice(0, 500),
      });
    }
  }

  async getSystemStats(): Promise<SystemStats> {
    const response = await this.request("/system_stats");
    return (await this.parseJson(response)) as SystemStats;
  }

  async submitPrompt(workflow: WorkflowApiJson, clientId?: string): Promise<SubmitPromptResult> {
    const response = await this.request("/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, ...(clientId ? { client_id: clientId } : {}) }),
    });
    const json = (await this.parseJson(response)) as {
      prompt_id?: string;
      node_errors?: Record<string, unknown>;
      error?: unknown;
    };

    if (json.node_errors && Object.keys(json.node_errors).length > 0) {
      throw new ComfyApiError("ComfyUI báo lỗi ở node khi submit prompt", "node_errors", json.node_errors);
    }
    if (!json.prompt_id) {
      throw new ComfyApiError("ComfyUI không trả về prompt_id", "invalid_json", json);
    }

    return { promptId: json.prompt_id };
  }

  async getHistory(promptId: string): Promise<HistoryEntry> {
    const response = await this.request(`/history/${encodeURIComponent(promptId)}`);
    const json = (await this.parseJson(response)) as Record<
      string,
      { status?: { status_str?: string }; outputs?: Record<string, { images?: HistoryImageRef[] }> }
    >;

    const entry = json[promptId];
    if (!entry) {
      return { status: "not_found", images: [] };
    }

    const images: HistoryImageRef[] = [];
    for (const output of Object.values(entry.outputs ?? {})) {
      for (const image of output.images ?? []) {
        images.push(image);
      }
    }

    const statusStr = entry.status?.status_str;
    return {
      status: statusStr === "success" || images.length > 0 ? "completed" : "running",
      images,
    };
  }

  async getQueue(): Promise<unknown> {
    const response = await this.request("/queue");
    return this.parseJson(response);
  }

  /**
   * Returns the prompt_ids currently running or pending in ComfyUI's queue.
   * A prompt sits here while being processed and only moves to /history once
   * finished, so this is how we tell "still working" apart from "lost".
   */
  async getActivePromptIds(): Promise<Set<string>> {
    const json = (await this.getQueue()) as {
      queue_running?: unknown[];
      queue_pending?: unknown[];
    };
    const ids = new Set<string>();
    for (const list of [json.queue_running, json.queue_pending]) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        // Each queue entry is [number, prompt_id, prompt, extra_data, outputs].
        const promptId = Array.isArray(entry) ? entry[1] : undefined;
        if (typeof promptId === "string") ids.add(promptId);
      }
    }
    return ids;
  }

  async viewImage(ref: HistoryImageRef): Promise<ArrayBuffer> {
    const params = new URLSearchParams({
      filename: ref.filename,
      subfolder: ref.subfolder,
      type: ref.type,
    });
    const response = await this.request(`/view?${params.toString()}`);
    if (!response.ok) {
      throw new ComfyApiError(`Không tải được ảnh output (HTTP ${response.status})`, "http_error");
    }
    return response.arrayBuffer();
  }
}
