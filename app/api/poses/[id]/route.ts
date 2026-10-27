import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { poseUpdateSchema } from "@/lib/validations/presets";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const pose = await prisma.posePreset.findUnique({ where: { id } });
    if (!pose) return apiError("not_found", "Không tìm thấy tư thế", 404);
    return NextResponse.json(pose);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = poseUpdateSchema.parse(await request.json());

    if (body.name) {
      const existing = await prisma.posePreset.findUnique({ where: { name: body.name } });
      if (existing && existing.id !== id) {
        return apiError("duplicate_name", `Tên tư thế "${body.name}" đã được sử dụng`, 409);
      }
    }

    const pose = await prisma.posePreset.update({ where: { id }, data: body });
    return NextResponse.json(pose);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Hard-deletes the pose row. Past GenerationJob rows referencing it use
 * onDelete: SetNull and already carry a poseNameSnapshot/prompt snapshot
 * taken at generation time, so history display is unaffected.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.posePreset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
