import { prisma } from "@/lib/db";
import { getOrCreateSettings, getOrCreateGlobalPrompt } from "@/lib/settings";
import { getWorkflowConfig, loadWorkflowJson, parseNodeMapping } from "@/lib/comfyui/workflow-store";
import { applyWorkflowMapping, type ApplyMappingValues } from "@/lib/comfyui/workflow-mapper";
import { buildPrompts } from "@/lib/prompts/build-prompts";
import { mergeTags } from "@/lib/prompts/merge-tags";
import { ComfyClient, ComfyApiError } from "@/lib/comfyui/client";
import { LlmClient, LlmApiError } from "@/lib/llm/client";
import {
  CALENDAR_SYSTEM_PROMPT_REAL,
  CALENDAR_SYSTEM_PROMPT_ANIME,
  SHARED_BIAS_PROMPT,
  ANIME_COVER_TYPOGRAPHY_HINT,
  ANIME_SINGLE_SUBJECT_HINT,
  composeUserMessage,
} from "@/lib/llm/default-system-prompt";
import { finalizeSuggestedImage } from "@/lib/llm/finalize-suggestion";
import { resolveLlmConfig } from "@/lib/llm/resolve-config";
import { GenerationSetupError } from "@/lib/generations/create-batch";

interface FreshPrompt {
  positive: string;
  negative: string;
}

/**
 * Gọi LLM sinh MỘT prompt mới, đúng vai trò (bìa trước có chữ / artwork sạch),
 * dùng chung pipeline với route /suggest (system prompt REAL/ANIME theo medium,
 * cùng regex làm sạch + ép tag qua `finalizeSuggestedImage`) để kết quả nhất
 * quán với lúc tạo batch ban đầu. Luôn xin 2 ảnh ở LLM (`expectedCount: 2`) rồi
 * chỉ lấy đúng slot theo vai trò -- tránh LLM hiểu nhầm "chỉ cần 1 ảnh = bìa"
 * khi thực ra đang cần sinh lại một trang artwork.
 */
async function generateFreshPromptForJob({
  request,
  mediumId,
  isCover,
}: {
  request: string;
  mediumId: string | null;
  isCover: boolean;
}): Promise<FreshPrompt> {
  const settings = await getOrCreateSettings();
  const llmConfig = resolveLlmConfig(settings);
  if (!llmConfig) {
    throw new LlmApiError("Chưa cấu hình URL ComfyUI, vui lòng cấu hình ở trang Cài đặt", "no_config");
  }

  let styleHint: string | undefined;
  let isAnimeMedium = false;
  if (mediumId) {
    const medium = await prisma.mediumPreset.findUnique({ where: { id: mediumId } });
    if (medium && medium.isActive) {
      styleHint =
        `Phong cách BẮT BUỘC cho toàn bộ ảnh: "${medium.name}"` +
        (medium.description ? ` — ${medium.description}.` : ".") +
        ` Hệ thống đã tự chèn sẵn tag phong cách/chất lượng, nên KHÔNG lặp lại tag phong cách; hãy tập trung mô tả chủ thể, trang phục, bối cảnh, ánh sáng, tư thế cho khớp.`;
      isAnimeMedium =
        medium.name.toLowerCase().includes("anime") || (medium.description?.toLowerCase().includes("anime") ?? false);
      if (isAnimeMedium) {
        styleHint += ` ${ANIME_COVER_TYPOGRAPHY_HINT} ${ANIME_SINGLE_SUBJECT_HINT}`;
      }
    }
  }

  const userMessage = composeUserMessage({ request, count: 2, styleHint });
  const baseSystemPrompt = isAnimeMedium ? CALENDAR_SYSTEM_PROMPT_ANIME : CALENDAR_SYSTEM_PROMPT_REAL;
  const systemPrompt = SHARED_BIAS_PROMPT.trim() ? `${SHARED_BIAS_PROMPT}\n\n${baseSystemPrompt}` : baseSystemPrompt;

  const client = new LlmClient({ baseUrl: llmConfig.baseUrl, model: llmConfig.model });
  const result = await client.generatePrompts({ systemPrompt, userMessage, expectedCount: 2 });

  // images[0] = bìa (vai trò ảnh #1 trong system prompt), images[1] = artwork.
  const slotIndex = isCover ? 0 : 1;
  const image = finalizeSuggestedImage(result.images[slotIndex], { isCover, isAnimeMedium });

  return { positive: image.positive, negative: result.negative };
}

/**
 * "Sửa lại" một ảnh TẠI CHỖ: gọi LLM sinh prompt MỚI (không tái dùng prompt cũ,
 * vốn có thể chứa tag xung đột do LLM lần trước sinh ra) theo đúng vai trò của
 * job (`indexInBatch === 0` -> bìa trước, còn lại -> artwork), GIỮ SEED chung
 * của batch để gương mặt vẫn đồng nhất với các trang khác, xoá ảnh lỗi cũ của
 * job và submit lại ComfyUI. Job ở lại ĐÚNG batch/indexInBatch ban đầu nên
 * luồng xuất 14 trang (exportBatchFolders) không bị ảnh hưởng.
 */
export async function regenerateJobFreshPrompt(jobId: string) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new GenerationSetupError("Không tìm thấy job cần sửa lại", "not_found");
  }
  const batch = await prisma.generationBatch.findUnique({ where: { id: job.batchId } });
  if (!batch) {
    throw new GenerationSetupError("Không tìm thấy batch chứa job này", "not_found");
  }

  const settings = await getOrCreateSettings();
  if (!settings.comfyBaseUrl) {
    throw new GenerationSetupError("Chưa cấu hình URL kết nối ComfyUI", "not_configured");
  }

  const workflowConfig = await getWorkflowConfig();
  if (!workflowConfig) {
    throw new GenerationSetupError("Chưa import workflow", "no_workflow");
  }
  const workflow = await loadWorkflowJson(workflowConfig.workflowRelativePath);
  const mapping = parseNodeMapping(workflowConfig.nodeMappingJson);

  const isCover = job.indexInBatch === 0;
  const fresh = await generateFreshPromptForJob({ request: batch.ideaPrompt, mediumId: batch.mediumId, isCover });

  const medium = batch.mediumId ? await prisma.mediumPreset.findUnique({ where: { id: batch.mediumId } }) : null;
  const positiveOverride = mergeTags(medium?.positivePrompt, fresh.positive);
  const negativeOverride = mergeTags(medium?.negativePrompt, fresh.negative) || undefined;

  const globalPrompt = await getOrCreateGlobalPrompt();
  const built = buildPrompts({
    globalPositive: globalPrompt.positivePrompt,
    globalNegative: globalPrompt.negativePrompt,
    stylePositive: "",
    styleNegative: "",
    imagePositiveOverride: positiveOverride,
    imageNegativeOverride: negativeOverride,
  });

  // Xoá ảnh lỗi cũ của job (file đĩa cũ trở thành orphan vô hại -- export đọc
  // theo DB nên không bị ảnh hưởng); job vẫn ở nguyên batch/indexInBatch cũ.
  await prisma.generatedImage.deleteMany({ where: { jobId } });

  const updatedJob = await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      positiveFinal: built.positiveFinal,
      negativeFinal: built.negativeFinal,
      status: "queued",
      promptId: null,
      errorCode: null,
      errorMessage: null,
      submittedAt: null,
      startedAt: null,
      finishedAt: null,
      // Giữ nguyên seed chung của batch để gương mặt đồng nhất với các trang khác.
    },
  });

  // Đưa batch về "running" để poller nền (chỉ sync batch queued/running) bắt
  // lại job này; job-sync sẽ tự tính lại status batch chính xác ở lần sync kế.
  // Bìa sau, thư mục file in và mockup đều dựng từ ảnh cũ -> đánh dấu cần xuất lại.
  await prisma.generationBatch.update({
    where: { id: batch.id },
    data: { status: "running", backCoverStatus: null, finalExportStatus: null, mockupStatus: null },
  });

  const client = new ComfyClient({ baseUrl: settings.comfyBaseUrl, token: process.env.COMFY_GATEWAY_TOKEN });
  const values: ApplyMappingValues = {
    positivePrompt: updatedJob.positiveFinal,
    negativePrompt: updatedJob.negativeFinal,
    seed: Number(updatedJob.seed),
    width: updatedJob.width ?? undefined,
    height: updatedJob.height ?? undefined,
    steps: updatedJob.steps ?? undefined,
    cfg: updatedJob.cfg ?? undefined,
    sampler: updatedJob.sampler ?? undefined,
    scheduler: updatedJob.scheduler ?? undefined,
    batchSize: 1,
  };

  try {
    const mappedWorkflow = applyWorkflowMapping(workflow, mapping, values);
    const result = await client.submitPrompt(mappedWorkflow, batch.id);
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { promptId: result.promptId, status: "queued", submittedAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định khi gửi job";
    const code = error instanceof ComfyApiError ? error.code : "submit_failed";
    console.error(`[regenerateJobFreshPrompt] submit thất bại cho job ${jobId}:`, error);
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "failed", errorCode: code, errorMessage: message, finishedAt: new Date() },
    });
  }

  return prisma.generationBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { jobs: true } });
}
