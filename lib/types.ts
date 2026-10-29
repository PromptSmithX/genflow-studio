import type { StylePreset, ScenePreset, PosePreset, MediumPreset, GlobalPrompt, GeneratedImage } from "@prisma/client";
import type { NodeSummary, NodeMapping } from "@/lib/comfyui/workflow-mapper";

export type StyleDTO = StylePreset;
export type SceneDTO = ScenePreset;
export type PoseDTO = PosePreset;
export type MediumDTO = MediumPreset;
export type GlobalPromptDTO = GlobalPrompt;
export type GeneratedImageDTO = GeneratedImage;

export interface SettingsDTO {
  comfyBaseUrl: string | null;
  hasGatewayToken: boolean;
  defaultWidth: number;
  defaultHeight: number;
  defaultSteps: number;
  defaultCfg: number;
  defaultSeedMode: "random" | "fixed";
  defaultFixedSeed: number | null;
  maxImagesPerBatch: number;
  outputDirectory: string;
  llmBaseUrl: string | null;
  llmModel: string | null;
  llmSystemPrompt: string | null;
  hasLlmKey: boolean;
  updatedAt: string;
}

export type ConnectionStatusResponse =
  | { state: "not_configured" }
  | { state: "configured_untested"; comfyBaseUrl: string };

export interface ConnectionTestResponse {
  state: "connected" | "disconnected" | "error" | "not_configured";
  checkedAt: string;
  version?: string | null;
  gpu?: string | null;
  vramFreeMb?: number | null;
  vramTotalMb?: number | null;
  error?: { code: string; message: string };
}

export interface WorkflowSummaryResponse {
  configured: boolean;
  originalFilename?: string;
  importedAt?: string;
  nodeCount?: number;
  isValidated?: boolean;
  validatedAt?: string | null;
  nodes?: NodeSummary[];
  mapping?: NodeMapping;
}

export interface MappingValidationResponse {
  valid: boolean;
  issues: { field: string; nodeId: string; inputKey: string; message: string }[];
}

export type JobStatusDTO = "queued" | "running" | "completed" | "failed" | "unknown";
export type BatchStatusDTO = "queued" | "running" | "completed" | "partial" | "failed";

export interface GenerationJobDTO {
  id: string;
  batchId: string;
  indexInBatch: number;
  styleId: string | null;
  styleNameSnapshot: string | null;
  stylePositiveSnapshot: string | null;
  styleNegativeSnapshot: string | null;
  sceneId: string | null;
  sceneNameSnapshot: string | null;
  scenePositiveSnapshot: string | null;
  sceneNegativeSnapshot: string | null;
  poseId: string | null;
  poseNameSnapshot: string | null;
  posePositiveSnapshot: string | null;
  poseNegativeSnapshot: string | null;
  ideaPromptSnapshot: string;
  positiveFinal: string;
  negativeFinal: string;
  promptId: string | null;
  status: JobStatusDTO;
  seed: number | null;
  width: number | null;
  height: number | null;
  steps: number | null;
  cfg: number | null;
  sampler: string | null;
  scheduler: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  submittedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  images: GeneratedImageDTO[];
}

export interface GenerationBatchDTO {
  id: string;
  ideaPrompt: string;
  status: BatchStatusDTO;
  requestedCount: number;
  createdAt: string;
  updatedAt: string;
  jobs: GenerationJobDTO[];
}

export interface HistoryListResponse {
  jobs: (GenerationJobDTO & { batch: { id: string; ideaPrompt: string; createdAt: string } })[];
  nextCursor: string | null;
}
