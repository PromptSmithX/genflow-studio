import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { nodeMappingSchema } from "@/lib/validations/generations";
import { getWorkflowConfig } from "@/lib/comfyui/workflow-store";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    const config = await getWorkflowConfig();
    if (!config) {
      return apiError("no_workflow", "Chưa import workflow", 400);
    }

    const mapping = nodeMappingSchema.parse(await request.json());
    const updated = await prisma.workflowConfig.update({
      where: { id: "main" },
      data: { nodeMappingJson: JSON.stringify(mapping), isValidated: false, validatedAt: null },
    });

    return NextResponse.json({ mapping, updatedAt: updated.updatedAt });
  } catch (error) {
    return handleApiError(error);
  }
}
