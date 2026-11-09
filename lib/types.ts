import type { StylePreset, MediumPreset, GeneratedImage } from "@prisma/client";
import type { NodeSummary, NodeMapping } from "@/lib/comfyui/workflow-mapper";

export type StyleDTO = StylePreset;
export type MediumDTO = MediumPreset;
export type GeneratedImageDTO = GeneratedImage;

export interface SettingsDTO {
  comfyBaseUrl: string | null;
  hasGatewayToken: boolean;
  runpodEndpointId: string | null;
  hasRunpodKey: boolean;
  defaultWidth: number;
  defaultHeight: number;
  defaultSteps: number;
  defaultCfg: number;
  defaultSeedMode: "random" | "fixed";
  defaultFixedSeed: number | null;
  maxImagesPerBatch: number;
  outputDirectory: string;
  autoPublish: boolean;
  autoFormatId: string;
  advancedMode: boolean;
  llmBaseUrl: string | null;
  llmModel: string | null;
  llmSystemPrompt: string | null;
  hasLlmKey: boolean;
  updatedAt: string;
}

export type ConnectionStatusResponse =
  | { state: "not_configured" }
  | { state: "configured_untested"; runpodEndpointId: string };

export interface ConnectionTestResponse {
  state: "connected" | "disconnected" | "error" | "not_configured";
  checkedAt: string;
  workers?: Record<string, number>;
  jobs?: Record<string, number>;
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
  backCoverRelativePath: string | null;
  backCoverStatus: "done" | "failed" | null;
  backCoverFormat: string | null;
  backCoverWidth: number | null;
  backCoverHeight: number | null;
  finalExportStatus: "done" | "failed" | null;
  finalExportRelativePath: string | null;
  mockupStatus: "done" | "failed" | null;
  etsyTitle: string | null;
  etsyDescription: string | null;
  etsyTagsJson: string | null;
  r2SkuBase?: string | null;
  r2Folder?: string | null;
  r2Status?: "done" | "failed" | null;
  r2PushedAt?: string | null;
  r2Error?: string | null;
  autoStatus?: "pending" | "retrying" | "processing" | "done" | "failed" | "skipped" | "legacy" | null;
  autoStage?: "export" | "r2" | "sheet" | null;
  autoError?: string | null;
  autoFinishedAt?: string | null;
  sheetSyncedAt?: string | null;
}

export interface HistoryListResponse {
  batches: GenerationBatchDTO[];
  nextCursor: string | null;
}

export type JobDetailDTO = GenerationJobDTO & { batch: Omit<GenerationBatchDTO, "jobs"> };
