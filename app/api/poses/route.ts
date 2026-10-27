import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { poseCreateSchema } from "@/lib/validations/presets";

export const runtime = "nodejs";

export async function GET() {
  try {
    const poses = await prisma.posePreset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return NextResponse.json(poses);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = poseCreateSchema.parse(await request.json());

    const existing = await prisma.posePreset.findUnique({ where: { name: body.name } });
    if (existing) {
      return apiError("duplicate_name", `Tên tư thế "${body.name}" đã được sử dụng`, 409);
    }

    const pose = await prisma.posePreset.create({ data: body });
    return NextResponse.json(pose, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
