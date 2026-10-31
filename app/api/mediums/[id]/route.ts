import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { mediumUpdateSchema } from "@/lib/validations/mediums";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const medium = await prisma.mediumPreset.findUnique({ where: { id } });
    if (!medium) return apiError("not_found", "Không tìm thấy kiểu ảnh", 404);
    return NextResponse.json(medium);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = mediumUpdateSchema.parse(await request.json());

    if (body.name) {
      const existing = await prisma.mediumPreset.findUnique({ where: { name: body.name } });
      if (existing && existing.id !== id) {
        return apiError("duplicate_name", `Tên kiểu ảnh "${body.name}" đã được sử dụng`, 409);
      }
    }

    const medium = await prisma.mediumPreset.update({ where: { id }, data: body });
    return NextResponse.json(medium);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Hard-deletes the medium row. GenerationJob rows never reference it by id --
 * its tags are only ever merged into positiveOverride/negativeOverride at
 * generation time, so past jobs are already snapshotted and unaffected.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.mediumPreset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
