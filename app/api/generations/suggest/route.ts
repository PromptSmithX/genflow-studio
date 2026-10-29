import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api/errors";
import { getOrCreateSettings } from "@/lib/settings";
import { suggestPromptsSchema } from "@/lib/validations/llm";
import { LlmClient, LlmApiError } from "@/lib/llm/client";
import {
  CALENDAR_SYSTEM_PROMPT,
  SINGLE_SUBJECT_QUALITY_TAGS,
  composeUserMessage,
} from "@/lib/llm/default-system-prompt";
import { mergeTags } from "@/lib/prompts/merge-tags";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const input = suggestPromptsSchema.parse(await request.json());
    const settings = await getOrCreateSettings();
    const apiKey = process.env.LLM_API_KEY;

    if (!settings.llmBaseUrl || !settings.llmModel || !apiKey) {
      throw new LlmApiError("Chưa cấu hình Trợ lý AI, vui lòng cấu hình ở trang Cài đặt", "no_config");
    }

    let styleHint: string | undefined;
    if (input.mediumId) {
      const medium = await prisma.mediumPreset.findUnique({ where: { id: input.mediumId } });
      if (medium && medium.isActive) {
        styleHint =
          `Phong cách BẮT BUỘC cho toàn bộ ảnh: "${medium.name}"` +
          (medium.description ? ` — ${medium.description}.` : ".") +
          ` Hệ thống đã tự chèn sẵn tag phong cách/chất lượng, nên KHÔNG lặp lại tag phong cách; hãy tập trung mô tả chủ thể, trang phục, bối cảnh, ánh sáng, tư thế cho khớp.`;
      }
    }

    const userMessage = composeUserMessage({
      request: input.request,
      count: input.count,
      styleHint,
    });
    // Trợ lý AI luôn tạo bộ ảnh lịch (ảnh #1 = bìa có chữ, còn lại = artwork sạch).
    const systemPrompt = CALENDAR_SYSTEM_PROMPT;
    const client = new LlmClient({ baseUrl: settings.llmBaseUrl, apiKey, model: settings.llmModel });

    let result;
    try {
      result = await client.generatePrompts({
        systemPrompt,
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

    // Chỉ ẢNH ĐẦU TIÊN (trang bìa) được có chữ; mọi ảnh sau là artwork sạch.
    // Dù system prompt đã yêu cầu điều này, ta vẫn ép ở đây để không phụ thuộc
    // vào việc LLM có tuân thủ đúng hay không.
    // Model đang chạy Turbo (CFG=1, negative bị ZeroOut vô hiệu hoá) nên không
    // có negative để loại trừ dị tật (2 người, sai tỉ lệ đầu/thân) -- ép thêm
    // tag kiểm soát số lượng người + tỉ lệ cơ thể vào MỌI positive.
    result.images.forEach((image, index) => {
      if (index !== 0) {
        image.layout = undefined;
        image.textLayers = undefined;
      }
      image.positive = mergeTags(image.positive, SINGLE_SUBJECT_QUALITY_TAGS);
    });

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
