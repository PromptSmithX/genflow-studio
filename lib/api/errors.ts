import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { RunpodApiError } from "@/lib/comfyui/runpod-client";
import { LlmApiError } from "@/lib/llm/client";
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

// Normalizes thrown errors into project-wide { error: { code, message, details } } shape.
export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return apiError("validation_error", "Dữ liệu gửi lên không hợp lệ", 400, error.flatten());
  }
  if (error instanceof RunpodApiError) {
    return apiError(error.code, error.message, 502, error.details);
  }
  if (error instanceof LlmApiError) {
    return apiError(error.code, error.message, error.code === "no_config" ? 400 : 502);
  }
  if (error instanceof GenerationSetupError) {
    const status = error.code === "conflict" ? 409 : error.code === "not_found" ? 404 : 400;
    return apiError(error.code, error.message, status);
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
