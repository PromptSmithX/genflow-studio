import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveLlmConfig } from "@/lib/llm/resolve-config";
import { getWorkflowConfig } from "@/lib/comfyui/workflow-store";
import { getRunpodClient } from "@/lib/comfyui/runpod-client";
import { suggestPrompts } from "@/lib/llm/suggest-prompts";
import { mergeTags } from "@/lib/prompts/merge-tags";
import { randomSeed } from "@/lib/seed";
import { createAndSubmitBatch } from "@/lib/generations/create-batch";
import { GenerationSetupError } from "@/lib/generations/errors";
import { draftParamsSchema, type EnqueueDraftInput } from "@/lib/validations/generations";
import type { DraftQueueItemDTO } from "@/lib/types";
import { CALENDAR_IMAGE_COUNT } from "@/lib/calendar/constants";

/**
 * Hàng đợi soạn mô tả ở SERVER: bấm "Thêm vào hàng đợi" chỉ tạo batch
 * status "drafting" rồi trả về ngay; việc gọi LLM soạn 13 prompt và gửi RunPod
 * chạy nền ở đây, nên người dùng nhập bộ tiếp hoặc rời trang thoải mái. Mỗi lúc
 * chỉ soạn 1 bộ (LLM chậm, dễ bị rate-limit), cũ trước.
 */

interface DraftQueueState {
  running?: boolean;
  activeBatchId?: string | null;
}

// Lưu trên globalThis để dev HMR không tạo 2 vòng xử lý song song.
const store = globalThis as typeof globalThis & { __animaDraftQueue?: DraftQueueState };
export const draftQueueState: DraftQueueState = (store.__animaDraftQueue ??= {});

export function getActiveDraftBatchId(): string | null {
  return draftQueueState.activeBatchId ?? null;
}

/** Báo lỗi cấu hình NGAY lúc bấm, thay vì xếp hàng một bộ chắc chắn sẽ lỗi. */
async function assertReadyToDraft(): Promise<void> {
  const settings = await getOrCreateSettings();
  if (!resolveLlmConfig(settings)) {
    throw new GenerationSetupError("Chưa cấu hình Trợ lý AI (API key) — vào Cài đặt", "no_config");
  }
  getRunpodClient(settings);
  const workflow = await getWorkflowConfig();
  if (!workflow || !workflow.isValidated) {
    throw new GenerationSetupError("Chưa import hoặc chưa validate workflow — vào Cài đặt", "no_workflow");
  }
}

export async function enqueueDraft(input: EnqueueDraftInput) {
  await assertReadyToDraft();
  const { request, mediumId, ...params } = input;
  const batch = await prisma.generationBatch.create({
    data: {
      ideaPrompt: request,
      requestedCount: CALENDAR_IMAGE_COUNT,
      status: "drafting",
      mediumId: mediumId ?? null,
      draftParamsJson: JSON.stringify(params),
    },
  });
  kickDraftQueue();
  return batch;
}

/** Đưa một bộ soạn lỗi về hàng chờ. */
export async function retryDraft(batchId: string) {
  const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status !== "drafting") {
    throw new GenerationSetupError("Bộ lịch này không còn trong hàng đợi soạn mô tả", "not_found");
  }
  await prisma.generationBatch.update({ where: { id: batchId }, data: { draftError: null } });
  kickDraftQueue();
}

/** Huỷ một bộ chưa soạn (đang chờ hoặc đã lỗi); bộ đang soạn thì không huỷ được. */
export async function cancelDraft(batchId: string) {
  const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status !== "drafting") {
    throw new GenerationSetupError("Chỉ huỷ được bộ lịch đang chờ soạn mô tả", "not_found");
  }
  if (draftQueueState.activeBatchId === batchId) {
    throw new GenerationSetupError("AI đang soạn bộ này, không huỷ được — đợi xong rồi xoá sau", "conflict");
  }
  await prisma.generationBatch.delete({ where: { id: batchId } });
}

const QUEUE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Các bộ đang trong hàng đợi hoặc đang tạo ảnh, cũ trước -- cho panel ở trang Tạo. */
export async function listDraftQueue(): Promise<DraftQueueItemDTO[]> {
  const batches = await prisma.generationBatch.findMany({
    where: {
      status: { in: ["drafting", "queued", "running"] },
      createdAt: { gte: new Date(Date.now() - QUEUE_WINDOW_MS) },
    },
    include: { jobs: { select: { status: true, _count: { select: { images: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const mediumIds = [...new Set(batches.map((batch) => batch.mediumId).filter((id): id is string => Boolean(id)))];
  const mediums = mediumIds.length
    ? await prisma.mediumPreset.findMany({ where: { id: { in: mediumIds } }, select: { id: true, name: true } })
    : [];
  const mediumName = new Map(mediums.map((medium) => [medium.id, medium.name]));
  const activeId = getActiveDraftBatchId();

  let waitingPosition = 0;
  return batches.map((batch) => {
    let state: DraftQueueItemDTO["state"];
    let queuePosition: number | null = null;
    if (batch.status !== "drafting") {
      state = "generating";
    } else if (batch.draftError) {
      state = "draft_failed";
    } else if (batch.id === activeId) {
      state = "drafting";
    } else {
      state = "waiting";
      queuePosition = ++waitingPosition;
    }
    return {
      id: batch.id,
      ideaPrompt: batch.ideaPrompt,
      mediumName: batch.mediumId ? mediumName.get(batch.mediumId) ?? null : null,
      createdAt: batch.createdAt.toISOString(),
      state,
      queuePosition,
      draftError: batch.draftError,
      readyCount: batch.jobs.filter((job) => job.status === "completed" && job._count.images > 0).length,
      totalCount: batch.requestedCount,
    };
  });
}

/** Chạy hàng đợi nếu chưa chạy; gọi lặp lại an toàn (poller gọi mỗi tick). */
export function kickDraftQueue(): void {
  if (draftQueueState.running) return;
  draftQueueState.running = true;
  void drainDraftQueue()
    .catch((error) => console.error("[draft-queue] vòng xử lý lỗi:", error))
    .finally(() => {
      draftQueueState.running = false;
      draftQueueState.activeBatchId = null;
    });
}

async function drainDraftQueue(): Promise<void> {
  for (;;) {
    const next = await prisma.generationBatch.findFirst({
      where: { status: "drafting", draftError: null },
      orderBy: { createdAt: "asc" },
    });
    if (!next) return;
    draftQueueState.activeBatchId = next.id;
    await runDraft(next);
    draftQueueState.activeBatchId = null;
  }
}

function parseDraftParams(json: string | null) {
  try {
    const parsed = draftParamsSchema.safeParse(JSON.parse(json ?? "{}"));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function runDraft(batch: {
  id: string;
  ideaPrompt: string;
  mediumId: string | null;
  draftParamsJson: string | null;
}): Promise<void> {
  try {
    const suggestions = await suggestPrompts({
      request: batch.ideaPrompt,
      count: CALENDAR_IMAGE_COUNT,
      mediumId: batch.mediumId,
    });
    // Tag phong cách/chất lượng của Kiểu ảnh do app kiểm soát, ghép trước mỗi
    // positive và vào negative chung -- không phụ thuộc tag LLM tự viết.
    const medium = batch.mediumId
      ? await prisma.mediumPreset.findUnique({ where: { id: batch.mediumId } })
      : null;
    const params = parseDraftParams(batch.draftParamsJson);

    await createAndSubmitBatch(
      {
        ideaPrompt: batch.ideaPrompt,
        mediumId: batch.mediumId,
        images: suggestions.images.map((image) => ({
          positiveOverride: mergeTags(medium?.positivePrompt, image.positive),
          negativeOverride: mergeTags(medium?.negativePrompt, suggestions.negative) || undefined,
        })),
        etsy: suggestions.etsy
          ? {
              title: suggestions.etsy.title || undefined,
              description: suggestions.etsy.description || undefined,
              tags: suggestions.etsy.tags.length ? suggestions.etsy.tags : undefined,
            }
          : undefined,
        concept: {
          theme: suggestions.concept?.campaignTheme || undefined,
          anchorTags: suggestions.concept?.anchorTags || undefined,
          seedKey: suggestions.conceptSeedKey || undefined,
          appearanceKey: suggestions.appearanceKey || undefined,
        },
        ...params,
        // Chung 1 seed cho cả bộ để gương mặt đồng nhất giữa các ảnh.
        seedMode: "fixed",
        fixedSeed: randomSeed(),
        incrementFixedSeed: false,
      },
      { existingBatchId: batch.id },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định khi soạn mô tả";
    console.error(`[draft-queue] soạn batch ${batch.id} thất bại:`, error);
    await prisma.generationBatch
      .update({ where: { id: batch.id }, data: { draftError: message } })
      .catch((updateError) => console.error("[draft-queue] ghi lỗi thất bại:", updateError));
  }
}
