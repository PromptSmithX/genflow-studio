import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api/errors";
import { getOrCreateSettings } from "@/lib/settings";
import { suggestPromptsSchema } from "@/lib/validations/llm";
import { LlmClient, LlmApiError } from "@/lib/llm/client";
import {
  CALENDAR_SYSTEM_PROMPT_REAL,
  CALENDAR_SYSTEM_PROMPT_ANIME,
  SHARED_BIAS_PROMPT,
  ANIME_COVER_TYPOGRAPHY_HINT,
  ANIME_SINGLE_SUBJECT_HINT,
  composeUserMessage,
} from "@/lib/llm/default-system-prompt";
import { finalizeSuggestedImage, finalizeEtsy } from "@/lib/llm/finalize-suggestion";
import { resolveLlmConfig } from "@/lib/llm/resolve-config";
import { loadRecentConcepts, pickConceptSeed } from "@/lib/llm/concept-diversity";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const input = suggestPromptsSchema.parse(await request.json());
    const settings = await getOrCreateSettings();
    // LLM gọi trực tiếp nhà cung cấp bằng API key từ AppSettings.
    const llmConfig = resolveLlmConfig(settings);
    if (!llmConfig) {
      throw new LlmApiError("Chưa cấu hình Trợ lý AI (API key) — vào Cài đặt", "no_config");
    }

    let styleHint: string | undefined;
    let isAnimeMedium = false;
    if (input.mediumId) {
      const medium = await prisma.mediumPreset.findUnique({ where: { id: input.mediumId } });
      if (medium && medium.isActive) {
        styleHint =
          `Phong cách BẮT BUỘC cho toàn bộ ảnh: "${medium.name}"` +
          (medium.description ? ` — ${medium.description}.` : ".") +
          ` Hệ thống đã tự chèn sẵn tag phong cách/chất lượng, nên KHÔNG lặp lại tag phong cách; hãy tập trung mô tả chủ thể, trang phục, bối cảnh, ánh sáng, tư thế cho khớp.`;

        isAnimeMedium =
          medium.name.toLowerCase().includes("anime") ||
          (medium.description?.toLowerCase().includes("anime") ?? false);
        if (isAnimeMedium) {
          styleHint += ` ${ANIME_COVER_TYPOGRAPHY_HINT} ${ANIME_SINGLE_SUBJECT_HINT}`;
        }
      }
    }

    // Đa dạng concept giữa các bộ bằng code: né concept vài bộ gần nhất + bốc
    // ngẫu nhiên 1 concept gợi ý (chỉ áp dụng khi người dùng không nêu bối cảnh).
    const recentConcepts = await loadRecentConcepts();
    const conceptSeed = pickConceptSeed(recentConcepts);
    const userMessage = composeUserMessage({
      request: input.request,
      count: input.count,
      styleHint,
      conceptSeed: conceptSeed.text,
      avoidConcepts: recentConcepts.themes,
    });
    // Trợ lý AI luôn tạo bộ ảnh lịch (ảnh #1 = bìa có chữ, còn lại = artwork sạch).
    // Chọn system prompt tách riêng theo loại: anime vs người thực.
    const baseSystemPrompt = isAnimeMedium ? CALENDAR_SYSTEM_PROMPT_ANIME : CALENDAR_SYSTEM_PROMPT_REAL;
    // Khung dùng chung (SHARED_BIAS_PROMPT) được chèn ở ĐẦU system prompt, TRƯỚC
    // khi gửi cho LLM -- chi phối cả REAL và ANIME. Khi còn rỗng, bỏ qua hoàn
    // toàn để không đổi hành vi hiện tại.
    const systemPrompt = SHARED_BIAS_PROMPT.trim()
      ? `${SHARED_BIAS_PROMPT}\n\n${baseSystemPrompt}`
      : baseSystemPrompt;
    const client = new LlmClient({
      baseUrl: llmConfig.baseUrl,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
    });

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
          `[LLM suggest error] model=${llmConfig.model} code=${error.code} message=${error.message}\n` +
            `--- user message ---\n${userMessage}\n` +
            `--- raw LLM details ---\n${JSON.stringify(error.details, null, 2)}`,
        );
      }
      throw error;
    }

    // Chỉ ẢNH ĐẦU TIÊN (trang bìa) được có chữ; mọi ảnh sau là artwork sạch.
    // finalizeSuggestedImage dùng chung với luồng "Sửa lại" (regenerate-fresh)
    // nên 2 nơi luôn áp đúng cùng một ràng buộc.
    result.images.forEach((image, index) => {
      finalizeSuggestedImage(image, {
        isCover: index === 0,
        isAnimeMedium,
        anchorTags: result.concept?.anchorTags,
      });
    });
    if (result.etsy) {
      finalizeEtsy(result.etsy);
    }

    console.log(
      `[LLM suggest] model=${llmConfig.model} usage=${JSON.stringify(result.usage)}\n` +
        `--- user message ---\n${userMessage}\n` +
        `--- concept ---\n${JSON.stringify(result.concept ?? null)}\n` +
        `--- negative ---\n${result.negative}\n` +
        result.images.map((image, index) => `--- positive #${index + 1} ---\n${image.positive}`).join("\n"),
    );

    return NextResponse.json({ ...result, conceptSeedKey: conceptSeed.key });
  } catch (error) {
    return handleApiError(error);
  }
}
