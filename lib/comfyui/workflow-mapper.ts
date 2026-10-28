export type WorkflowApiJson = Record<string, WorkflowNode>;

export interface WorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

export type MappableField =
  | "positivePrompt"
  | "negativePrompt"
  | "seed"
  | "width"
  | "height"
  | "steps"
  | "cfg"
  | "sampler"
  | "scheduler"
  | "batchSize";

export interface FieldMapping {
  nodeId: string;
  inputKey: string;
  enabled: boolean;
}

export type NodeMapping = Partial<Record<MappableField, FieldMapping>>;

export interface ApplyMappingValues {
  positivePrompt?: string;
  negativePrompt?: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  batchSize?: number;
}

export class WorkflowMappingError extends Error {
  constructor(
    message: string,
    public readonly field: MappableField,
    public readonly nodeId: string,
    public readonly inputKey: string,
  ) {
    super(message);
    this.name = "WorkflowMappingError";
  }
}

function deepCloneWorkflow(workflow: WorkflowApiJson): WorkflowApiJson {
  return JSON.parse(JSON.stringify(workflow)) as WorkflowApiJson;
}

/**
 * Applies configured, enabled field mappings onto a deep clone of the
 * imported workflow. Never mutates the input workflow, since the same
 * parsed object is reused across every job in a batch. Throws a
 * WorkflowMappingError (instead of silently skipping) if a mapped node or
 * input key no longer exists, so generation stops before calling ComfyUI.
 */
export function applyWorkflowMapping(
  workflow: WorkflowApiJson,
  mapping: NodeMapping,
  values: ApplyMappingValues,
): WorkflowApiJson {
  const cloned = deepCloneWorkflow(workflow);

  for (const [field, fieldMapping] of Object.entries(mapping) as [
    MappableField,
    FieldMapping | undefined,
  ][]) {
    if (!fieldMapping || !fieldMapping.enabled) continue;
    const value = values[field];
    if (value === undefined) continue;

    const { nodeId, inputKey } = fieldMapping;
    const node = cloned[nodeId];
    if (!node) {
      throw new WorkflowMappingError(
        `Node "${nodeId}" mapped for field "${field}" does not exist in the workflow`,
        field,
        nodeId,
        inputKey,
      );
    }
    if (!node.inputs || !(inputKey in node.inputs)) {
      throw new WorkflowMappingError(
        `Input "${inputKey}" mapped for field "${field}" does not exist on node "${nodeId}" (class_type: ${node.class_type})`,
        field,
        nodeId,
        inputKey,
      );
    }

    node.inputs[inputKey] = value;
  }

  return cloned;
}

function readMappedInput(workflow: WorkflowApiJson, mapping: NodeMapping, field: MappableField): unknown {
  const fieldMapping = mapping[field];
  if (!fieldMapping || !fieldMapping.enabled) return undefined;
  const node = workflow[fieldMapping.nodeId];
  if (!node?.inputs || !(fieldMapping.inputKey in node.inputs)) return undefined;
  return node.inputs[fieldMapping.inputKey];
}

/**
 * Reads a field's current literal value straight from the workflow JSON via
 * the mapping, instead of a hard-coded app default. Returns undefined (not
 * null/0) when unmapped, or when the input is a node reference (e.g. a
 * latent/model link, `["nodeId", idx]`) rather than a literal number -- so
 * callers can safely `??` this into an "optional" value without ever
 * clobbering a wired-up reference.
 */
export function readMappedNumber(workflow: WorkflowApiJson, mapping: NodeMapping, field: MappableField): number | undefined {
  const value = readMappedInput(workflow, mapping, field);
  return typeof value === "number" ? value : undefined;
}

/** Same as {@link readMappedNumber} but for string-valued fields (sampler, scheduler). */
export function readMappedString(workflow: WorkflowApiJson, mapping: NodeMapping, field: MappableField): string | undefined {
  const value = readMappedInput(workflow, mapping, field);
  return typeof value === "string" ? value : undefined;
}

export interface NodeSummary {
  nodeId: string;
  classType: string;
  inputs: { key: string; valuePreview: string }[];
}

function previewValue(value: unknown): string {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.length <= 80) return str;
  return `${str.slice(0, 77)}...`;
}

export function summarizeWorkflowNodes(workflow: WorkflowApiJson): NodeSummary[] {
  return Object.entries(workflow).map(([nodeId, node]) => ({
    nodeId,
    classType: node.class_type,
    inputs: Object.entries(node.inputs ?? {}).map(([key, value]) => ({
      key,
      valuePreview: previewValue(value),
    })),
  }));
}

function nodeRefId(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function setGuess(mapping: NodeMapping, field: MappableField, nodeId: string, inputKey: string): void {
  mapping[field] = { nodeId, inputKey, enabled: true };
}

/**
 * Best-effort auto-detection of the node mapping right after import, so the
 * user reviews + validates instead of mapping all fields by hand. Heuristics
 * target the common ComfyUI node shapes (KSampler, CLIPTextEncode via the
 * sampler's positive/negative references, EmptyLatentImage); anything it
 * can't infer is left unmapped for manual selection. Never throws on odd
 * input -- returns whatever it could confidently guess.
 */
export function guessNodeMapping(workflow: WorkflowApiJson): NodeMapping {
  const mapping: NodeMapping = {};
  if (!workflow || typeof workflow !== "object") return mapping;

  const entries = Object.entries(workflow).filter(
    ([, node]) => node && typeof node === "object" && node.inputs && typeof node.inputs === "object",
  );

  // Sampler node: prefer a KSampler, else any node exposing positive+negative.
  const sampler =
    entries.find(([, node]) => /KSampler/i.test(node.class_type)) ??
    entries.find(([, node]) => "positive" in node.inputs && "negative" in node.inputs);

  if (sampler) {
    const [samplerId, samplerNode] = sampler;
    const inputs = samplerNode.inputs;

    if ("seed" in inputs) setGuess(mapping, "seed", samplerId, "seed");
    else if ("noise_seed" in inputs) setGuess(mapping, "seed", samplerId, "noise_seed");
    if ("steps" in inputs) setGuess(mapping, "steps", samplerId, "steps");
    if ("cfg" in inputs) setGuess(mapping, "cfg", samplerId, "cfg");
    if ("sampler_name" in inputs) setGuess(mapping, "sampler", samplerId, "sampler_name");
    if ("scheduler" in inputs) setGuess(mapping, "scheduler", samplerId, "scheduler");

    for (const [field, refKey] of [
      ["positivePrompt", "positive"],
      ["negativePrompt", "negative"],
    ] as const) {
      const refId = nodeRefId(inputs[refKey]);
      const target = refId ? workflow[refId] : undefined;
      if (refId && target?.inputs && "text" in target.inputs) {
        setGuess(mapping, field, refId, "text");
      }
    }
  }

  // Latent/size node.
  const latent = entries.find(([, node]) => /Empty(SD3)?Latent/i.test(node.class_type));
  if (latent) {
    const [latentId, latentNode] = latent;
    const inputs = latentNode.inputs;
    if ("width" in inputs) setGuess(mapping, "width", latentId, "width");
    if ("height" in inputs) setGuess(mapping, "height", latentId, "height");
    if ("batch_size" in inputs) setGuess(mapping, "batchSize", latentId, "batch_size");
  }

  return mapping;
}

export interface MappingValidationIssue {
  field: MappableField;
  nodeId: string;
  inputKey: string;
  message: string;
}

/**
 * Checks every enabled mapping entry against the current workflow without
 * mutating anything or requiring generation values, so the UI can offer a
 * "Validate mapping" action before any job is submitted.
 */
export function validateMapping(
  workflow: WorkflowApiJson,
  mapping: NodeMapping,
): MappingValidationIssue[] {
  const issues: MappingValidationIssue[] = [];

  for (const [field, fieldMapping] of Object.entries(mapping) as [
    MappableField,
    FieldMapping | undefined,
  ][]) {
    if (!fieldMapping || !fieldMapping.enabled) continue;
    const { nodeId, inputKey } = fieldMapping;
    const node = workflow[nodeId];
    if (!node) {
      issues.push({ field, nodeId, inputKey, message: `Node "${nodeId}" không tồn tại trong workflow` });
      continue;
    }
    if (!node.inputs || !(inputKey in node.inputs)) {
      issues.push({
        field,
        nodeId,
        inputKey,
        message: `Node "${nodeId}" (${node.class_type}) không có input "${inputKey}"`,
      });
    }
  }

  const requiredFields: MappableField[] = ["positivePrompt"];
  for (const field of requiredFields) {
    if (!mapping[field]?.enabled) {
      issues.push({
        field,
        nodeId: mapping[field]?.nodeId ?? "",
        inputKey: mapping[field]?.inputKey ?? "",
        message: `Trường bắt buộc "${field}" chưa được map`,
      });
    }
  }

  return issues;
}
