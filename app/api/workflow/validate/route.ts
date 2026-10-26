import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { getWorkflowConfig, loadWorkflowJson, parseNodeMapping } from "@/lib/comfyui/workflow-store";
import { validateMapping } from "@/lib/comfyui/workflow-mapper";

export const runtime = "nodejs";

export async function POST() {
  try {
    const config = await getWorkflowConfig();
    if (!config) {
      return apiError("no_workflow", "Chưa import workflow", 400);
    }

    const workflow = await loadWorkflowJson(config.workflowRelativePath);
    const mapping = parseNodeMapping(config.nodeMappingJson);
    const issues = validateMapping(workflow, mapping);

    const isValid = issues.length === 0;
    await prisma.workflowConfig.update({
      where: { id: "main" },
      data: { isValidated: isValid, validatedAt: isValid ? new Date() : null },
    });

    return NextResponse.json({ valid: isValid, issues });
  } catch (error) {
    return handleApiError(error);
  }
}
