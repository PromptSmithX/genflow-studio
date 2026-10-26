import { prisma } from "@/lib/db";
import { getOrCreateSettings, getOrCreateGlobalPrompt } from "@/lib/settings";
import { getWorkflowConfig, loadWorkflowJson, parseNodeMapping } from "@/lib/comfyui/workflow-store";
import { applyWorkflowMapping, validateMapping, type ApplyMappingValues } from "@/lib/comfyui/workflow-mapper";
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

  const style = await prisma.stylePreset.findUnique({ where: { id: input.styleId } });
  if (!style || !style.isActive) {
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

  const width = input.width ?? settings.defaultWidth;
  const height = input.height ?? settings.defaultHeight;
  const steps = input.steps ?? settings.defaultSteps;
  const cfg = input.cfg ?? settings.defaultCfg;

  const seeds = resolveSeeds({
    mode: input.seedMode,
    count: input.images.length,
    fixedSeed: input.fixedSeed ?? (settings.defaultFixedSeed ? Number(settings.defaultFixedSeed) : null),
    incrementFixedSeed: input.incrementFixedSeed ?? true,
  });

  const batchLabel = `${style.name} — ${input.images.length} ảnh`;

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
      stylePositive: style.positivePrompt,
      styleNegative: style.negativePrompt,
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
        styleId: style.id,
        styleNameSnapshot: style.name,
        stylePositiveSnapshot: style.positivePrompt,
        styleNegativeSnapshot: style.negativePrompt,
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
        seed: seeds[index],
        width,
        height,
        steps,
        cfg,
        sampler: input.sampler,
        scheduler: input.scheduler,
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
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: "failed", errorCode: code, errorMessage: message, finishedAt: new Date() },
      });
    }
  }

  return prisma.generationBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { jobs: true } });
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
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { status: "failed", errorCode: code, errorMessage: message, finishedAt: new Date() },
    });
  }

  return prisma.generationBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { jobs: true } });
}
