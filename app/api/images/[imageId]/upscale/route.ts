import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";
import { upscaleGeneratedImage } from "@/lib/generations/upscale-image";

export const runtime = "nodejs";

const upscaleSchema = z.object({
  formatId: z.string().trim().min(1, "Thiếu khổ lịch"),
});

interface Params {
  params: Promise<{ imageId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { imageId } = await params;
    const body = upscaleSchema.parse(await request.json().catch(() => ({})));
    const image = await upscaleGeneratedImage(imageId, body.formatId);
    return NextResponse.json(serializeBigInts(image));
  } catch (error) {
    return handleApiError(error);
  }
}
