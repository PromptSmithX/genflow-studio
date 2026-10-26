import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { getWorkflowConfig, loadWorkflowJson, parseNodeMapping, clearWorkflow } from "@/lib/comfyui/workflow-store";
import { summarizeWorkflowNodes } from "@/lib/comfyui/workflow-mapper";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = await getWorkflowConfig();
    if (!config) {
      return NextResponse.json({ configured: false });
    }

    const workflow = await loadWorkflowJson(config.workflowRelativePath);
    const nodes = summarizeWorkflowNodes(workflow);
    const mapping = parseNodeMapping(config.nodeMappingJson);

    return NextResponse.json({
      configured: true,
      originalFilename: config.originalFilename,
      importedAt: config.importedAt,
      nodeCount: config.nodeCount,
      isValidated: config.isValidated,
      validatedAt: config.validatedAt,
      nodes,
      mapping,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    await clearWorkflow();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
