import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { createGenerationSchema } from "@/lib/validations/generations";
import { createAndSubmitBatch } from "@/lib/generations/create-batch";
import { serializeBigInts } from "@/lib/api/serialize";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const input = createGenerationSchema.parse(await request.json());
    const batch = await createAndSubmitBatch(input);
    return NextResponse.json(serializeBigInts(batch), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
