import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { sceneCreateSchema } from "@/lib/validations/presets";

export const runtime = "nodejs";

export async function GET() {
  try {
    const scenes = await prisma.scenePreset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return NextResponse.json(scenes);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = sceneCreateSchema.parse(await request.json());

    const existing = await prisma.scenePreset.findUnique({ where: { name: body.name } });
    if (existing) {
      return apiError("duplicate_name", `Tên bối cảnh "${body.name}" đã được sử dụng`, 409);
    }

    const scene = await prisma.scenePreset.create({ data: body });
    return NextResponse.json(scene, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
