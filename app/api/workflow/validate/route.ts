import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { nodeMappingSchema } from "@/lib/validations/generations";
import { getWorkflowConfig, loadWorkflowJson, parseNodeMapping } from "@/lib/comfyui/workflow-store";
import { validateMapping } from "@/lib/comfyui/workflow-mapper";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const config = await getWorkflowConfig();
    if (!config) {
      return apiError("no_workflow", "Chưa import workflow", 400);
    }

    // Optionally persist a mapping passed in the body, then validate it, all in
    // one DB write -- so the client makes a single mutation and there is no race
    // between a "save" refetch (which sets isValidated=false) and this validate.
    // Only a NON-EMPTY posted mapping replaces the stored one, so an accidental
    // empty/partial body (e.g. clicked before the table finished loading) can
    // never clobber a good saved mapping with "{}".
    const body = await request.json().catch(() => null);
    const mappingJson =
      body && typeof body === "object" && Object.keys(body).length > 0
        ? JSON.stringify(nodeMappingSchema.parse(body))
        : config.nodeMappingJson;

    const workflow = await loadWorkflowJson(config.workflowRelativePath);
    const mapping = parseNodeMapping(mappingJson);
    const issues = validateMapping(workflow, mapping);

    const isValid = issues.length === 0;
    await prisma.workflowConfig.update({
      where: { id: "main" },
      data: { nodeMappingJson: mappingJson, isValidated: isValid, validatedAt: isValid ? new Date() : null },
    });

    console.log(`[validate] isValid=${isValid} issues=${issues.length}`);
    return NextResponse.json({ valid: isValid, issues });
  } catch (error) {
    return handleApiError(error);
  }
}
