import { NextRequest, NextResponse } from "next/server";
import { RunpodClient, RunpodApiError } from "@/lib/comfyui/runpod-client";
import { getOrCreateSettings } from "@/lib/settings";
import { connectionTestSchema } from "@/lib/validations/settings";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const checkedAt = new Date().toISOString();
  let body: { endpointId?: string; apiKey?: string } = {};
  try {
    const json = await request.json().catch(() => ({}));
    body = connectionTestSchema.parse(json);
  } catch {
    // Body is optional
  }

  const settings = await getOrCreateSettings();
  const endpointId = body.endpointId?.trim() || settings.runpodEndpointId || undefined;
  const apiKey =
    body.apiKey !== undefined && body.apiKey.trim() !== ""
      ? body.apiKey.trim()
      : settings.runpodApiKey || undefined;

  if (!endpointId || !apiKey) {
    return NextResponse.json(
      {
        state: "not_configured",
        checkedAt,
        error: { code: "not_configured", message: "Chưa cấu hình RunPod (Endpoint ID + API key)" },
      },
      { status: 400 },
    );
  }

  try {
    const client = new RunpodClient({ endpointId, apiKey });
    const health = await client.health();
    return NextResponse.json({
      state: "connected",
      checkedAt,
      workers: health.workers,
      jobs: health.jobs,
    });
  } catch (error) {
    if (error instanceof RunpodApiError) {
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
