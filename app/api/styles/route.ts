import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { styleCreateSchema } from "@/lib/validations/styles";

export const runtime = "nodejs";

export async function GET() {
  try {
    const styles = await prisma.stylePreset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return NextResponse.json(styles);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = styleCreateSchema.parse(await request.json());

    const existing = await prisma.stylePreset.findUnique({ where: { name: body.name } });
    if (existing) {
      return apiError("duplicate_name", `Tên style "${body.name}" đã được sử dụng`, 409);
    }

    const style = await prisma.stylePreset.create({ data: body });
    return NextResponse.json(style, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
