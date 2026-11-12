import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";
import { enqueueDraftSchema } from "@/lib/validations/generations";
import { enqueueDraft } from "@/lib/generations/draft-queue";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const input = enqueueDraftSchema.parse(await request.json());
    const batch = await enqueueDraft(input);
    return NextResponse.json(serializeBigInts(batch), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
