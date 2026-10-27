import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api/errors";
import { getOrCreateSettings } from "@/lib/settings";
import { suggestPromptsSchema } from "@/lib/validations/llm";
import { LlmClient, LlmApiError } from "@/lib/llm/client";
import { DEFAULT_LLM_SYSTEM_PROMPT, composeUserMessage } from "@/lib/llm/default-system-prompt";

export const runtime = "nodejs";

const MAX_VOCAB_TERMS = 30;

export async function POST(request: NextRequest) {
  try {
    const input = suggestPromptsSchema.parse(await request.json());
    const settings = await getOrCreateSettings();
    const apiKey = process.env.LLM_API_KEY;

    if (!settings.llmBaseUrl || !settings.llmModel || !apiKey) {
      throw new LlmApiError("Chưa cấu hình Trợ lý AI, vui lòng cấu hình ở trang Cài đặt", "no_config");
    }

    const [style, scenes, poses] = await Promise.all([
      input.styleId ? prisma.stylePreset.findUnique({ where: { id: input.styleId } }) : Promise.resolve(null),
      prisma.scenePreset.findMany({ where: { isActive: true } }),
      prisma.posePreset.findMany({ where: { isActive: true } }),
    ]);

    const vocab = [...scenes, ...poses]
      .map((preset) => preset.positivePrompt.trim())
      .filter((fragment) => fragment.length > 0)
      .slice(0, MAX_VOCAB_TERMS);

    const client = new LlmClient({ baseUrl: settings.llmBaseUrl, apiKey, model: settings.llmModel });
    const result = await client.generatePrompts({
      systemPrompt: settings.llmSystemPrompt?.trim() || DEFAULT_LLM_SYSTEM_PROMPT,
      userMessage: composeUserMessage({ request: input.request, count: input.count, styleName: style?.name, vocab }),
      expectedCount: input.count,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
