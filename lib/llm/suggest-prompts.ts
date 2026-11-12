import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import type { SuggestPromptsInput, SuggestPromptsResponse } from "@/lib/validations/llm";
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
import {
  ANIME_LOOK,
  LOCATION_FAMILIES,
  PHOTO_LOOK,
  TIME_WEATHER,
  loadRecentConcepts,
  pickConceptSeed,
} from "@/lib/llm/concept-diversity";
import { applyDecision } from "@/lib/llm/axis-decision";
import { analyzeIntent, summarizeIntent } from "@/lib/llm/intent-analysis";
import {
  loadRecentAppearances,
  pickAnimeAppearanceSeed,
  pickAppearanceSeed,
  requestWantsHeavyBody,
} from "@/lib/llm/appearance-diversity";

/**
 * Trợ lý AI soạn prompt cho cả bộ lịch: phân tích intent, bốc seed đa dạng,
 * gọi LLM rồi chuẩn hoá từng ảnh. Dùng chung bởi route /suggest và hàng đợi
 * soạn mô tả (lib/generations/draft-queue.ts).
 */
export async function suggestPrompts(
  input: Pick<SuggestPromptsInput, "request" | "count" | "mediumId">,
): Promise<SuggestPromptsResponse> {
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

  const client = new LlmClient({
    baseUrl: llmConfig.baseUrl,
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
  });

  // Xác định trục nào người dùng đã nêu/ngụ ý để seed đa dạng không đè lên ý họ.
  // null (lượt phân tích lỗi) -> bốc như cũ.
  const analysis = await analyzeIntent(client, input.request, isAnimeMedium);
  const intent = analysis?.axes ?? null;
  console.info(`[LLM intent] ${summarizeIntent(analysis)}`);

  // Đa dạng concept giữa các bộ bằng code: né concept vài bộ gần nhất + bốc
  // ngẫu nhiên 1 hướng concept cho các phần người dùng không nêu.
  const recentConcepts = await loadRecentConcepts();
  const conceptSeed = pickConceptSeed(recentConcepts, Math.random, {
    families: applyDecision(LOCATION_FAMILIES, (family) => family.key, intent?.location),
    timeWeather: applyDecision(TIME_WEATHER, (item) => item, intent?.timeWeather),
    looks: applyDecision(isAnimeMedium ? ANIME_LOOK : PHOTO_LOOK, (item) => item, intent?.look),
  });
  // Đa dạng ngoại hình nhân vật giữa các bộ (chỉ cho đặc điểm người dùng không nêu).
  const recentAppearances = await loadRecentAppearances();
  const appearanceSeed = isAnimeMedium
    ? pickAnimeAppearanceSeed(recentAppearances, Math.random, intent)
    : pickAppearanceSeed(input.request, recentAppearances, Math.random, intent);
  const allowHeavyBody = requestWantsHeavyBody(input.request);
  const userMessage = composeUserMessage({
    request: input.request,
    count: input.count,
    styleHint,
    conceptSeed: conceptSeed.text,
    avoidConcepts: recentConcepts.themes,
    appearanceSeed: appearanceSeed.text,
    coreIntent: analysis?.coreIntent,
    subjects: analysis?.subjects,
    isAnime: isAnimeMedium,
  });
  console.info(`[LLM intent] concept seed: ${JSON.stringify(conceptSeed.text)}`);
  // Trợ lý AI luôn tạo bộ ảnh lịch (ảnh #1 = bìa có chữ, còn lại = artwork sạch).
  // Chọn system prompt tách riêng theo loại: anime vs người thực.
  const baseSystemPrompt = isAnimeMedium ? CALENDAR_SYSTEM_PROMPT_ANIME : CALENDAR_SYSTEM_PROMPT_REAL;
  // Khung dùng chung (SHARED_BIAS_PROMPT) được chèn ở ĐẦU system prompt, TRƯỚC
  // khi gửi cho LLM -- chi phối cả REAL và ANIME. Khi còn rỗng, bỏ qua hoàn
  // toàn để không đổi hành vi hiện tại.
  const systemPrompt = SHARED_BIAS_PROMPT.trim()
    ? `${SHARED_BIAS_PROMPT}\n\n${baseSystemPrompt}`
    : baseSystemPrompt;

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
      allowHeavyBody,
      subjects: analysis?.subjects,
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

  return { ...result, conceptSeedKey: conceptSeed.key, appearanceKey: appearanceSeed.key };
}
