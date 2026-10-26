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
