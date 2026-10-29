import { prisma } from "@/lib/db";
import { getOrCreateSettings, getOrCreateGlobalPrompt } from "@/lib/settings";
import { getWorkflowConfig, loadWorkflowJson, parseNodeMapping } from "@/lib/comfyui/workflow-store";
import {
  applyWorkflowMapping,
  validateMapping,
  readMappedNumber,
  readMappedString,
  type ApplyMappingValues,
} from "@/lib/comfyui/workflow-mapper";
import { buildPrompts } from "@/lib/prompts/build-prompts";
import { resolveSeeds } from "@/lib/seed";
import { ComfyClient, ComfyApiError } from "@/lib/comfyui/client";
import type { CreateGenerationInput } from "@/lib/validations/generations";

export class GenerationSetupError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "GenerationSetupError";
  }
}

/**
 * Creates a GenerationBatch with one GenerationJob per requested image.
 * The style (fixed character) is shared across the whole batch; each image
 * may pick its own scene + pose. Final prompts/settings are snapshotted,
 * then each job is submitted to ComfyUI /prompt independently. A per-image
 * submit failure marks only that job as failed -- it never blocks the
 * other images in the same batch, and never gets silently retried.
 */
export async function createAndSubmitBatch(input: CreateGenerationInput) {
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
  const mappingIssues = validateMapping(workflow, mapping);
  if (mappingIssues.length > 0) {
    throw new GenerationSetupError("Node mapping chưa hợp lệ, vui lòng kiểm tra lại Cài đặt", "invalid_mapping");
  }

  if (input.images.length > settings.maxImagesPerBatch) {
    throw new GenerationSetupError(
      `Số ảnh vượt quá giới hạn ${settings.maxImagesPerBatch} ảnh/lần`,
      "too_many_images",
    );
  }

  const style = input.styleId ? await prisma.stylePreset.findUnique({ where: { id: input.styleId } }) : null;
  if (input.styleId && (!style || !style.isActive)) {
    throw new GenerationSetupError(`Style "${input.styleId}" không hợp lệ hoặc không còn hoạt động`, "invalid_style");
  }

  const sceneIds = [...new Set(input.images.map((image) => image.sceneId).filter((id): id is string => Boolean(id)))];
  const poseIds = [...new Set(input.images.map((image) => image.poseId).filter((id): id is string => Boolean(id)))];
  const scenes = sceneIds.length
    ? await prisma.scenePreset.findMany({ where: { id: { in: sceneIds } } })
    : [];
  const poses = poseIds.length ? await prisma.posePreset.findMany({ where: { id: { in: poseIds } } }) : [];
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const poseById = new Map(poses.map((pose) => [pose.id, pose]));

  const globalPrompt = await getOrCreateGlobalPrompt();

  // Prefer an explicit request value, else whatever the workflow JSON itself
  // has baked into the mapped node -- never silently overwrite a workflow's
  // own width/steps/cfg/sampler/scheduler with the app's generic defaults
  // (those only exist to pre-fill the Quick/Advanced form). A mode that
  // doesn't send these (e.g. Trợ lý AI) ends up leaving the workflow's own
  // settings untouched, since applyWorkflowMapping skips undefined values.
  const width = input.width ?? readMappedNumber(workflow, mapping, "width");
  const height = input.height ?? readMappedNumber(workflow, mapping, "height");
  const steps = input.steps ?? readMappedNumber(workflow, mapping, "steps");
  const cfg = input.cfg ?? readMappedNumber(workflow, mapping, "cfg");
  const sampler = input.sampler ?? readMappedString(workflow, mapping, "sampler");
  const scheduler = input.scheduler ?? readMappedString(workflow, mapping, "scheduler");

  const seeds = resolveSeeds({
    mode: input.seedMode,
    count: input.images.length,
    fixedSeed: input.fixedSeed ?? (settings.defaultFixedSeed ? Number(settings.defaultFixedSeed) : null),
    incrementFixedSeed: input.incrementFixedSeed ?? true,
  });

  const batchLabel =
    input.ideaPrompt?.trim() ||
    (style ? `${style.name} — ${input.images.length} ảnh` : `Trợ lý AI — ${input.images.length} ảnh`);

  const batch = await prisma.generationBatch.create({
    data: {
      ideaPrompt: batchLabel,
      requestedCount: input.images.length,
      status: "queued",
    },
  });

  const jobs = [];
  for (let index = 0; index < input.images.length; index++) {
    const imageRequest = input.images[index];
    const scene = imageRequest.sceneId ? sceneById.get(imageRequest.sceneId) ?? null : null;
    const pose = imageRequest.poseId ? poseById.get(imageRequest.poseId) ?? null : null;

    const built = buildPrompts({
      globalPositive: globalPrompt.positivePrompt,
      globalNegative: globalPrompt.negativePrompt,
      stylePositive: style?.positivePrompt ?? "",
      styleNegative: style?.negativePrompt ?? "",
      scenePositive: scene?.positivePrompt,
      sceneNegative: scene?.negativePrompt,
      posePositive: pose?.positivePrompt,
      poseNegative: pose?.negativePrompt,
      imagePositiveOverride: imageRequest.positiveOverride,
      imageNegativeOverride: imageRequest.negativeOverride,
    });

    const job = await prisma.generationJob.create({
      data: {
        batchId: batch.id,
        indexInBatch: index,
        styleId: style?.id ?? null,
        styleNameSnapshot: style?.name ?? null,
        stylePositiveSnapshot: style?.positivePrompt ?? null,
        styleNegativeSnapshot: style?.negativePrompt ?? null,
        sceneId: scene?.id ?? null,
        sceneNameSnapshot: scene?.name ?? null,
        scenePositiveSnapshot: scene?.positivePrompt ?? null,
        sceneNegativeSnapshot: scene?.negativePrompt ?? null,
        poseId: pose?.id ?? null,
        poseNameSnapshot: pose?.name ?? null,
        posePositiveSnapshot: pose?.positivePrompt ?? null,
        poseNegativeSnapshot: pose?.negativePrompt ?? null,
        ideaPromptSnapshot: batchLabel,
        positiveFinal: built.positiveFinal,
        negativeFinal: built.negativeFinal,
        overlaySpecJson: imageRequest.overlaySpec ? JSON.stringify(imageRequest.overlaySpec) : null,
        seed: seeds[index],
        width: width ?? null,
        height: height ?? null,
        steps: steps ?? null,
        cfg: cfg ?? null,
        sampler: sampler ?? null,
        scheduler: scheduler ?? null,
        status: "queued",
      },
    });
    jobs.push(job);
  }

  const client = new ComfyClient({ baseUrl: settings.comfyBaseUrl, token: process.env.COMFY_GATEWAY_TOKEN });

  for (const job of jobs) {
    const values: ApplyMappingValues = {
      positivePrompt: job.positiveFinal,
      negativePrompt: job.negativeFinal,
      seed: Number(job.seed),
      width: job.width ?? undefined,
      height: job.height ?? undefined,
      steps: job.steps ?? undefined,
      cfg: job.cfg ?? undefined,
      sampler: job.sampler ?? undefined,
      scheduler: job.scheduler ?? undefined,
      batchSize: 1,
    };

    try {
      const mappedWorkflow = applyWorkflowMapping(workflow, mapping, values);
      const result = await client.submitPrompt(mappedWorkflow, batch.id);
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { promptId: result.promptId, status: "queued", submittedAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lỗi không xác định khi gửi job";
      const code = error instanceof ComfyApiError ? error.code : "submit_failed";
      logSubmitError(job.id, error);
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: "failed", errorCode: code, errorMessage: message, finishedAt: new Date() },
      });
    }
  }

  return prisma.generationBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { jobs: true } });
}

/**
 * Logs a failed ComfyUI submit to the Next.js terminal for diagnosis. Only the
 * error message + its structured `details` (node_errors) are logged -- never
 * request headers, so the gateway token/authorization header is never printed.
 */
function logSubmitError(jobId: string, error: unknown): void {
  if (error instanceof ComfyApiError) {
    console.error(
      `[ComfyUI submit] job=${jobId} code=${error.code} ${error.message}\n` +
        `details=${JSON.stringify(error.details)}`,
    );
  } else {
    console.error(`[ComfyUI submit] job=${jobId}`, error);
  }
}

export interface RegenerateOptions {
  seedMode: "same" | "random";
}

/**
 * Clones a past job's full prompt/settings snapshot into a brand-new
 * batch+job and submits it to ComfyUI, without touching or overwriting
 * the original job -- regeneration is purely additive history.
 */
export async function regenerateJob(sourceJobId: string, options: RegenerateOptions) {
  const source = await prisma.generationJob.findUnique({ where: { id: sourceJobId } });
  if (!source) {
    throw new GenerationSetupError("Không tìm thấy job gốc để tạo lại", "not_found");
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

  const seed =
    options.seedMode === "same" && source.seed !== null ? Number(source.seed) : resolveSeeds({ mode: "random", count: 1 })[0];

  const batch = await prisma.generationBatch.create({
    data: { ideaPrompt: source.ideaPromptSnapshot, requestedCount: 1, status: "queued" },
  });

  const job = await prisma.generationJob.create({
    data: {
      batchId: batch.id,
      indexInBatch: 0,
      styleId: source.styleId,
      styleNameSnapshot: source.styleNameSnapshot,
      stylePositiveSnapshot: source.stylePositiveSnapshot,
      styleNegativeSnapshot: source.styleNegativeSnapshot,
      sceneId: source.sceneId,
      sceneNameSnapshot: source.sceneNameSnapshot,
      scenePositiveSnapshot: source.scenePositiveSnapshot,
      sceneNegativeSnapshot: source.sceneNegativeSnapshot,
      poseId: source.poseId,
      poseNameSnapshot: source.poseNameSnapshot,
      posePositiveSnapshot: source.posePositiveSnapshot,
      poseNegativeSnapshot: source.poseNegativeSnapshot,
      ideaPromptSnapshot: source.ideaPromptSnapshot,
      positiveFinal: source.positiveFinal,
      negativeFinal: source.negativeFinal,
      overlaySpecJson: source.overlaySpecJson,
      seed,
      width: source.width,
      height: source.height,
      steps: source.steps,
      cfg: source.cfg,
      sampler: source.sampler,
      scheduler: source.scheduler,
      status: "queued",
    },
  });

  const client = new ComfyClient({ baseUrl: settings.comfyBaseUrl, token: process.env.COMFY_GATEWAY_TOKEN });
  const values: ApplyMappingValues = {
    positivePrompt: job.positiveFinal,
    negativePrompt: job.negativeFinal,
    seed,
    width: job.width ?? undefined,
    height: job.height ?? undefined,
    steps: job.steps ?? undefined,
    cfg: job.cfg ?? undefined,
    sampler: job.sampler ?? undefined,
    scheduler: job.scheduler ?? undefined,
    batchSize: 1,
  };

  try {
    const mappedWorkflow = applyWorkflowMapping(workflow, mapping, values);
    const result = await client.submitPrompt(mappedWorkflow, batch.id);
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { promptId: result.promptId, status: "queued", submittedAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định khi gửi job";
    const code = error instanceof ComfyApiError ? error.code : "submit_failed";
    logSubmitError(job.id, error);
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { status: "failed", errorCode: code, errorMessage: message, finishedAt: new Date() },
    });
  }

  return prisma.generationBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { jobs: true } });
}
