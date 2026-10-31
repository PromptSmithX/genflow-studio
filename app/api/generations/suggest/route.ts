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
  SINGLE_SUBJECT_QUALITY_TAGS,
  FRAMING_MARGIN_TAGS,
  ANIME_COVER_TYPOGRAPHY_HINT,
  ANIME_SINGLE_SUBJECT_TAGS,
  ANIME_SINGLE_SUBJECT_HINT,
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

    const userMessage = composeUserMessage({
      request: input.request,
      count: input.count,
      styleHint,
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
    // Đồng thời, loại bỏ triệt để các cụm từ copy space / negative space có thể khiến
    // mô hình AI vẽ dải banner màu đặc cắt ngang người nhân vật.
    const BANNER_TAGS_REGEX =
      /\b(with\s+(plenty|ample)\s+of\s+)?(empty\s+)?(copy\s*space|negative\s*space)(\s+(at\s+the|at|in|on)\s+[a-z]+(\s+of\s+the\s+frame)?)?\b/gi;
    const FLOOR_TAGS_REGEX = /\bclean\s+simple\s+floor\b/gi;
    // Các cụm khiến model băm khung thành nhiều cảnh/dải tách rời (ảnh bị chia đôi).
    const SPLIT_TAGS_REGEX =
      /\b(split\s*(composition|screen|frame)?|collage|diptych|triptych|(two|multiple|split)\s+(scenes|backgrounds|panels)|divided\s+frame|panel\s+layout|(upper|top|bottom|lower)\s+half\s+[a-z ]*?(lower|bottom|top|upper)\s+half)\b/gi;
    const CALENDAR_LABEL = "CALENDAR";

    result.images.forEach((image, index) => {
      // Làm sạch bất kỳ từ khoá copy space nào mà LLM có thể đã sinh ra
      image.positive = image.positive
        .replace(BANNER_TAGS_REGEX, "")
        .replace(FLOOR_TAGS_REGEX, "")
        .replace(SPLIT_TAGS_REGEX, "")
        .replace(/,\s*,/g, ",")
        .trim();

      if (index !== 0) {
        image.title = undefined;
        image.year = undefined;
        // Anime: ép single-subject lên ĐẦU positive (model đánh trọng số token
        // đầu mạnh); nhánh người giữ nguyên tag chung ở cuối.
        image.positive = isAnimeMedium
          ? mergeTags(ANIME_SINGLE_SUBJECT_TAGS, FRAMING_MARGIN_TAGS, image.positive)
          : mergeTags(image.positive, FRAMING_MARGIN_TAGS, SINGLE_SUBJECT_QUALITY_TAGS);
      } else {
        // Bìa lịch: model ảnh tự vẽ chữ. App chỉ đảm bảo 3 chuỗi bắt buộc
        // (title / "CALENDAR" / year) thật sự có mặt trong positive, không phụ
        // thuộc việc LLM có tuân thủ đúng chỉ dẫn hay không.
        const title = image.title?.trim() || "THE COLLECTION";
        const year = image.year?.trim() || String(new Date().getFullYear() + 1);
        image.title = title;
        image.year = year;

        const missingTags: string[] = [];
        const lowerPositive = image.positive.toLowerCase();
        if (!lowerPositive.includes(title.toLowerCase())) {
          missingTags.push(`large bold cinematic title text "${title}"`);
        }
        if (!lowerPositive.includes(CALENDAR_LABEL.toLowerCase())) {
          missingTags.push(`uppercase text "${CALENDAR_LABEL}", exact spelling, clearly legible`);
        }
        if (!lowerPositive.includes(year.toLowerCase())) {
          missingTags.push(`year text "${year}"`);
        }

        image.positive = isAnimeMedium
          ? mergeTags(
              ANIME_SINGLE_SUBJECT_TAGS,
              FRAMING_MARGIN_TAGS,
              image.positive,
              ...missingTags,
              "large clear readable typography, text placed in empty background area away from the subject, single continuous scene",
            )
          : mergeTags(
              image.positive,
              FRAMING_MARGIN_TAGS,
              ...missingTags,
              "large clear readable typography, text placed in empty background area away from the subject, single continuous scene",
              SINGLE_SUBJECT_QUALITY_TAGS,
            );
      }
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
