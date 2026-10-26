import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ComfyApiError } from "@/lib/comfyui/client";
import { WorkflowMappingError } from "@/lib/comfyui/workflow-mapper";
import { GenerationSetupError } from "@/lib/generations/create-batch";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function apiError(code: string, message: string, status: number, details?: unknown) {
  const body: ApiErrorBody = { error: { code, message, details } };
  return NextResponse.json(body, { status });
}

/**
 * Normalizes any thrown error from an API route into the project-wide
 * `{ error: { code, message, details } }` shape. Never forwards secrets:
 * ComfyApiError/WorkflowMappingError details are already sanitized at the
 * throw site, and unknown errors are reduced to a generic message.
 */
export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return apiError("validation_error", "Dữ liệu gửi lên không hợp lệ", 400, error.flatten());
  }
  if (error instanceof ComfyApiError) {
    return apiError(error.code, error.message, 502, error.details);
  }
  if (error instanceof GenerationSetupError) {
    return apiError(error.code, error.message, 400);
  }
  if (error instanceof WorkflowMappingError) {
    return apiError("mapping_error", error.message, 400, {
      field: error.field,
      nodeId: error.nodeId,
      inputKey: error.inputKey,
    });
  }
  if (error instanceof Error) {
    return apiError("internal_error", error.message, 500);
  }
  return apiError("internal_error", "Đã xảy ra lỗi không xác định", 500);
}
