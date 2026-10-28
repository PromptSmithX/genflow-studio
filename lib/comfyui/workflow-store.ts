import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { resolveSafePath, buildWorkflowUploadFilename } from "@/lib/files/safe-output";
import { guessNodeMapping, validateMapping } from "@/lib/comfyui/workflow-mapper";
import type { NodeMapping, WorkflowApiJson } from "@/lib/comfyui/workflow-mapper";

export const WORKFLOW_ROOT = path.join(process.cwd(), "data", "workflows");

export async function getWorkflowConfig() {
  return prisma.workflowConfig.findUnique({ where: { id: "main" } });
}

export function parseNodeMapping(nodeMappingJson: string): NodeMapping {
  try {
    return JSON.parse(nodeMappingJson) as NodeMapping;
  } catch {
    return {};
  }
}

export async function loadWorkflowJson(workflowRelativePath: string): Promise<WorkflowApiJson> {
  const fullPath = resolveSafePath(WORKFLOW_ROOT, workflowRelativePath);
  const text = await fs.readFile(fullPath, "utf-8");
  return JSON.parse(text) as WorkflowApiJson;
}

/**
 * Validates the uploaded file is parseable JSON representing a non-empty
 * object (the ComfyUI "Save (API Format)" shape), then writes it to disk
 * under a generated, collision-safe filename and upserts the singleton
 * WorkflowConfig row. The previous workflow file is left on disk (not
 * deleted) so an in-progress import failure never destroys prior state.
 */
export async function importWorkflow(rawText: string, originalFilename: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("File không phải JSON hợp lệ");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Workflow JSON phải là một object không rỗng");
  }

  const nodeCount = Object.keys(parsed as Record<string, unknown>).length;
  if (nodeCount === 0) {
    throw new Error("Workflow JSON không có node nào");
  }

  await fs.mkdir(WORKFLOW_ROOT, { recursive: true });
  const filename = buildWorkflowUploadFilename(originalFilename);
  const fullPath = resolveSafePath(WORKFLOW_ROOT, filename);
  await fs.writeFile(fullPath, JSON.stringify(parsed, null, 2), "utf-8");

  // Best-effort auto-detected mapping, then auto-validate it: if the guess is
  // structurally complete the workflow is ready to generate right away, with no
  // separate manual "Validate" step to forget (or to lose by clicking "Save").
  const guessed = guessNodeMapping(parsed as WorkflowApiJson);
  const guessedMapping = JSON.stringify(guessed);
  const isValid = validateMapping(parsed as WorkflowApiJson, guessed).length === 0;
  const validatedAt = isValid ? new Date() : null;

  const config = await prisma.workflowConfig.upsert({
    where: { id: "main" },
    create: {
      id: "main",
      workflowRelativePath: filename,
      originalFilename,
      nodeCount,
      nodeMappingJson: guessedMapping,
      isValidated: isValid,
      validatedAt,
    },
    update: {
      workflowRelativePath: filename,
      originalFilename,
      nodeCount,
      nodeMappingJson: guessedMapping,
      isValidated: isValid,
      validatedAt,
    },
  });

  return config;
}

export async function clearWorkflow() {
  await prisma.workflowConfig.deleteMany({ where: { id: "main" } });
}
