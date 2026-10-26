import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { sceneUpdateSchema } from "@/lib/validations/presets";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const scene = await prisma.scenePreset.findUnique({ where: { id } });
    if (!scene) return apiError("not_found", "Không tìm thấy bối cảnh", 404);
    return NextResponse.json(scene);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = sceneUpdateSchema.parse(await request.json());

    if (body.name) {
      const existing = await prisma.scenePreset.findUnique({ where: { name: body.name } });
      if (existing && existing.id !== id) {
        return apiError("duplicate_name", `Tên bối cảnh "${body.name}" đã được sử dụng`, 409);
      }
    }

    const scene = await prisma.scenePreset.update({ where: { id }, data: body });
    return NextResponse.json(scene);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Hard-deletes the scene row. Past GenerationJob rows referencing it use
 * onDelete: SetNull and already carry a sceneNameSnapshot/prompt snapshot
 * taken at generation time, so history display is unaffected.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.scenePreset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
