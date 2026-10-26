import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { styleUpdateSchema } from "@/lib/validations/styles";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const style = await prisma.stylePreset.findUnique({ where: { id } });
    if (!style) return apiError("not_found", "Không tìm thấy style", 404);
    return NextResponse.json(style);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = styleUpdateSchema.parse(await request.json());

    if (body.name) {
      const existing = await prisma.stylePreset.findUnique({ where: { name: body.name } });
      if (existing && existing.id !== id) {
        return apiError("duplicate_name", `Tên style "${body.name}" đã được sử dụng`, 409);
      }
    }

    const style = await prisma.stylePreset.update({ where: { id }, data: body });
    return NextResponse.json(style);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Hard-deletes the style row. Any past GenerationJob rows referencing it
 * use onDelete: SetNull, and already carry a styleNameSnapshot/prompt
 * snapshot taken at generation time, so history display is unaffected.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.stylePreset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
