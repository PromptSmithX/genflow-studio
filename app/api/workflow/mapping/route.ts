import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { nodeMappingSchema } from "@/lib/validations/generations";
import { getWorkflowConfig, loadWorkflowJson } from "@/lib/comfyui/workflow-store";
import { validateMapping } from "@/lib/comfyui/workflow-mapper";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    const config = await getWorkflowConfig();
    if (!config) {
      return apiError("no_workflow", "Chưa import workflow", 400);
    }

    const mapping = nodeMappingSchema.parse(await request.json());

    // Saving also (re)computes validity, so a valid mapping stays validated
    // instead of being forced back to "chưa validate" on every save.
    const workflow = await loadWorkflowJson(config.workflowRelativePath);
    const isValid = validateMapping(workflow, mapping).length === 0;

    const updated = await prisma.workflowConfig.update({
      where: { id: "main" },
      data: {
        nodeMappingJson: JSON.stringify(mapping),
        isValidated: isValid,
        validatedAt: isValid ? new Date() : null,
      },
    });

    return NextResponse.json({ mapping, isValidated: isValid, updatedAt: updated.updatedAt });
  } catch (error) {
    return handleApiError(error);
  }
}
