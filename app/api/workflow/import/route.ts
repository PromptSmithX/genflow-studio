import { NextRequest, NextResponse } from "next/server";
import { handleApiError, apiError } from "@/lib/api/errors";
import { importWorkflow } from "@/lib/comfyui/workflow-store";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError("missing_file", "Vui lòng chọn file workflow JSON", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return apiError("file_too_large", "File vượt quá giới hạn 10MB", 400);
    }
    if (file.type && !file.type.includes("json") && !file.name.endsWith(".json")) {
      return apiError("invalid_file_type", "Chỉ chấp nhận file .json", 400);
    }

    const text = await file.text();
    const config = await importWorkflow(text, file.name);
    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    if (error instanceof Error && !("code" in error)) {
      return apiError("invalid_workflow", error.message, 400);
    }
    return handleApiError(error);
  }
}
