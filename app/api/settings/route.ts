import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api/errors";
import { settingsUpdateSchema } from "@/lib/validations/settings";
import { parseComfyBaseUrl } from "@/lib/validations/url";
import { getOrCreateSettings, redactSettings } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = await getOrCreateSettings();
    return NextResponse.json(redactSettings(settings));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = settingsUpdateSchema.parse(await request.json());

    let comfyBaseUrl: string | null | undefined = undefined;
    if (body.comfyBaseUrl !== undefined) {
      if (body.comfyBaseUrl === null || body.comfyBaseUrl === "") {
        comfyBaseUrl = null;
      } else {
        const parsed = parseComfyBaseUrl(body.comfyBaseUrl);
        if (!parsed.ok) {
          return NextResponse.json(
            { error: { code: "invalid_url", message: parsed.error } },
            { status: 400 },
          );
        }
        comfyBaseUrl = parsed.url;
      }
    }

    await getOrCreateSettings();
    const updated = await prisma.appSettings.update({
      where: { id: "main" },
      data: {
        ...(comfyBaseUrl !== undefined ? { comfyBaseUrl } : {}),
        ...(body.defaultWidth !== undefined ? { defaultWidth: body.defaultWidth } : {}),
        ...(body.defaultHeight !== undefined ? { defaultHeight: body.defaultHeight } : {}),
        ...(body.defaultSteps !== undefined ? { defaultSteps: body.defaultSteps } : {}),
        ...(body.defaultCfg !== undefined ? { defaultCfg: body.defaultCfg } : {}),
        ...(body.defaultSeedMode !== undefined ? { defaultSeedMode: body.defaultSeedMode } : {}),
        ...(body.defaultFixedSeed !== undefined
          ? { defaultFixedSeed: body.defaultFixedSeed === null ? null : BigInt(body.defaultFixedSeed) }
          : {}),
        ...(body.maxImagesPerBatch !== undefined ? { maxImagesPerBatch: body.maxImagesPerBatch } : {}),
        ...(body.outputDirectory !== undefined ? { outputDirectory: body.outputDirectory } : {}),
      },
    });

    // Gateway token is never persisted to the DB or returned to the client;
    // it is only ever read from the server-side env var at request time.
    if (body.gatewayToken) {
      console.warn(
        "A gateway token was submitted via the API but is not persisted. Set COMFY_GATEWAY_TOKEN in the server environment instead.",
      );
    }

    return NextResponse.json(redactSettings(updated));
  } catch (error) {
    return handleApiError(error);
  }
}
