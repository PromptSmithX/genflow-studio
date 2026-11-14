import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { listDraftQueue } from "@/lib/generations/draft-queue";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ items: await listDraftQueue() });
  } catch (error) {
    return handleApiError(error);
  }
}
