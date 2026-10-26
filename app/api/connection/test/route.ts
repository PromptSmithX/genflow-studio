import { NextRequest, NextResponse } from "next/server";
import { ComfyClient, ComfyApiError } from "@/lib/comfyui/client";
import { getOrCreateSettings } from "@/lib/settings";
import { connectionTestSchema } from "@/lib/validations/settings";
import { parseComfyBaseUrl } from "@/lib/validations/url";

export const runtime = "nodejs";

/**
 * Tests connectivity against the *saved* comfyBaseUrl (optionally letting
 * the caller test a not-yet-saved candidate URL from the Settings form),
 * never an arbitrary request-supplied fetch target, to limit SSRF surface
 * on this local-only app.
 */
export async function POST(request: NextRequest) {
  const checkedAt = new Date().toISOString();
  let body: { baseUrl?: string } = {};
  try {
    const json = await request.json().catch(() => ({}));
    body = connectionTestSchema.partial().parse(json);
  } catch {
    // Body is optional; fall back to the saved URL.
  }

  let baseUrl = body.baseUrl;
  if (!baseUrl) {
    const settings = await getOrCreateSettings();
    baseUrl = settings.comfyBaseUrl ?? undefined;
  }

  if (!baseUrl) {
    return NextResponse.json(
      { state: "not_configured", checkedAt, error: { code: "no_url", message: "Chưa cấu hình URL ComfyUI" } },
      { status: 400 },
    );
  }

  const parsed = parseComfyBaseUrl(baseUrl);
  if (!parsed.ok) {
    return NextResponse.json(
      { state: "error", checkedAt, error: { code: "invalid_url", message: parsed.error } },
      { status: 400 },
    );
  }

  try {
    const client = new ComfyClient({ baseUrl: parsed.url, token: process.env.COMFY_GATEWAY_TOKEN });
    const stats = await client.getSystemStats();
    const device = stats.devices?.[0];
    return NextResponse.json({
      state: "connected",
      checkedAt,
      version: stats.system?.comfyui_version ?? null,
      gpu: device?.name ?? null,
      vramFreeMb: device?.vram_free ? Math.round(device.vram_free / (1024 * 1024)) : null,
      vramTotalMb: device?.vram_total ? Math.round(device.vram_total / (1024 * 1024)) : null,
    });
  } catch (error) {
    if (error instanceof ComfyApiError) {
      return NextResponse.json(
        { state: "disconnected", checkedAt, error: { code: error.code, message: error.message } },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { state: "disconnected", checkedAt, error: { code: "unknown", message: "Lỗi không xác định" } },
      { status: 502 },
    );
  }
}
