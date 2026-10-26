import { NextResponse } from "next/server";
import { getOrCreateSettings } from "@/lib/settings";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";

/**
 * Reports configuration state only -- never claims "connected" just
 * because a URL is saved. The frontend must call POST /api/connection/test
 * to get a real, timestamped connectivity result.
 */
export async function GET() {
  try {
    const settings = await getOrCreateSettings();
    if (!settings.comfyBaseUrl) {
      return NextResponse.json({ state: "not_configured" as const });
    }
    return NextResponse.json({ state: "configured_untested" as const, comfyBaseUrl: settings.comfyBaseUrl });
  } catch (error) {
    return handleApiError(error);
  }
}
