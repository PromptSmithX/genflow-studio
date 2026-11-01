import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const styles = await prisma.stylePreset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return NextResponse.json(styles);
  } catch (error) {
    return handleApiError(error);
  }
}
