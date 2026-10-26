import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";
import { regenerateJob } from "@/lib/generations/create-batch";

export const runtime = "nodejs";

const regenerateSchema = z.object({
  seedMode: z.enum(["same", "random"]).default("random"),
});

interface Params {
  params: Promise<{ jobId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;
    const body = regenerateSchema.parse(await request.json().catch(() => ({})));
    const batch = await regenerateJob(jobId, { seedMode: body.seedMode });
    return NextResponse.json(serializeBigInts(batch), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
