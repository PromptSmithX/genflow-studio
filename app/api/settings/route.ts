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

    let runpodEndpointId: string | null | undefined = undefined;
    if (body.runpodEndpointId !== undefined) {
      runpodEndpointId = body.runpodEndpointId || null;
    }

    let runpodApiKey: string | null | undefined = undefined;
    if (body.runpodApiKey !== undefined) {
      if (body.runpodApiKey === null) {
        runpodApiKey = null;
      } else if (body.runpodApiKey !== "") {
        runpodApiKey = body.runpodApiKey;
      }
    }

    let llmBaseUrl: string | null | undefined = undefined;
    if (body.llmBaseUrl !== undefined) {
      llmBaseUrl = body.llmBaseUrl || null;
    }

    let llmApiKey: string | null | undefined = undefined;
    if (body.llmApiKey !== undefined) {
      if (body.llmApiKey === null) {
        llmApiKey = null;
      } else if (body.llmApiKey !== "") {
        llmApiKey = body.llmApiKey;
      }
    }

    await getOrCreateSettings();
    const updated = await prisma.appSettings.update({
      where: { id: "main" },
      data: {
        ...(runpodEndpointId !== undefined ? { runpodEndpointId } : {}),
        ...(runpodApiKey !== undefined ? { runpodApiKey } : {}),
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
        ...(body.autoPublish !== undefined ? { autoPublish: body.autoPublish } : {}),
        ...(body.autoFormatId !== undefined ? { autoFormatId: body.autoFormatId } : {}),
        ...(body.advancedMode !== undefined ? { advancedMode: body.advancedMode } : {}),
        ...(llmBaseUrl !== undefined ? { llmBaseUrl } : {}),
        ...(llmApiKey !== undefined ? { llmApiKey } : {}),
        ...(body.llmModel !== undefined ? { llmModel: body.llmModel || null } : {}),
        ...(body.llmSystemPrompt !== undefined ? { llmSystemPrompt: body.llmSystemPrompt || null } : {}),
      },
    });

    // Gateway token chỉ đọc từ env; LLM API key lưu cục bộ trong AppSettings.
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
