import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, apiError } from "@/lib/api/errors";
import { mediumCreateSchema } from "@/lib/validations/mediums";

export const runtime = "nodejs";

export async function GET() {
  try {
    const mediums = await prisma.mediumPreset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return NextResponse.json(mediums);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = mediumCreateSchema.parse(await request.json());

    const existing = await prisma.mediumPreset.findUnique({ where: { name: body.name } });
    if (existing) {
      return apiError("duplicate_name", `Tên kiểu ảnh "${body.name}" đã được sử dụng`, 409);
    }

    const medium = await prisma.mediumPreset.create({ data: body });
    return NextResponse.json(medium, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
