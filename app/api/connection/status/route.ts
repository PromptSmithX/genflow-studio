import { NextResponse } from "next/server";
import { getOrCreateSettings } from "@/lib/settings";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = await getOrCreateSettings();
    if (!settings.runpodEndpointId || !settings.runpodApiKey) {
      return NextResponse.json({ state: "not_configured" as const });
    }
    return NextResponse.json({
      state: "configured_untested" as const,
      runpodEndpointId: settings.runpodEndpointId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
