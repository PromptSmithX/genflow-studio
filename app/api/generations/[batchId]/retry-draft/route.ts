import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { retryDraft } from "@/lib/generations/draft-queue";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ batchId: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    await retryDraft(batchId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
