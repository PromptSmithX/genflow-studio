import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api/errors";
import { globalPromptUpdateSchema } from "@/lib/validations/styles";
import { getOrCreateGlobalPrompt } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    const globalPrompt = await getOrCreateGlobalPrompt();
    return NextResponse.json(globalPrompt);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = globalPromptUpdateSchema.parse(await request.json());
    await getOrCreateGlobalPrompt();
    const updated = await prisma.globalPrompt.update({
      where: { id: "main" },
      data: { positivePrompt: body.positivePrompt, negativePrompt: body.negativePrompt },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
