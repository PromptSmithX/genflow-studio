import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { getOrCreateSettings } from "@/lib/settings";
import { suggestPromptsSchema } from "@/lib/validations/llm";
import { LlmClient, LlmApiError } from "@/lib/llm/client";
import { DEFAULT_LLM_SYSTEM_PROMPT, composeUserMessage } from "@/lib/llm/default-system-prompt";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const input = suggestPromptsSchema.parse(await request.json());
    const settings = await getOrCreateSettings();
    const apiKey = process.env.LLM_API_KEY;

    if (!settings.llmBaseUrl || !settings.llmModel || !apiKey) {
      throw new LlmApiError("Chưa cấu hình Trợ lý AI, vui lòng cấu hình ở trang Cài đặt", "no_config");
    }

    const userMessage = composeUserMessage({ request: input.request, count: input.count });
    const client = new LlmClient({ baseUrl: settings.llmBaseUrl, apiKey, model: settings.llmModel });

    let result;
    try {
      result = await client.generatePrompts({
        systemPrompt: settings.llmSystemPrompt?.trim() || DEFAULT_LLM_SYSTEM_PROMPT,
        userMessage,
        expectedCount: input.count,
      });
    } catch (error) {
      if (error instanceof LlmApiError) {
        console.error(
          `[LLM suggest error] model=${settings.llmModel} code=${error.code} message=${error.message}\n` +
            `--- user message ---\n${userMessage}\n` +
            `--- raw LLM details ---\n${JSON.stringify(error.details, null, 2)}`,
        );
      }
      throw error;
    }

    console.log(
      `[LLM suggest] model=${settings.llmModel} usage=${JSON.stringify(result.usage)}\n` +
        `--- user message ---\n${userMessage}\n` +
        `--- negative ---\n${result.negative}\n` +
        result.images.map((image, index) => `--- positive #${index + 1} ---\n${image.positive}`).join("\n"),
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
