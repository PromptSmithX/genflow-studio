import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { suggestPromptsSchema } from "@/lib/validations/llm";
import { suggestPrompts } from "@/lib/llm/suggest-prompts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const input = suggestPromptsSchema.parse(await request.json());
    return NextResponse.json(await suggestPrompts(input));
  } catch (error) {
    return handleApiError(error);
  }
}
