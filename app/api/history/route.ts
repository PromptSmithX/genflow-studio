import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const PAGE_SIZE = 24;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const status = searchParams.get("status");
    const styleId = searchParams.get("styleId");
    const search = searchParams.get("search")?.trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.GenerationJobWhereInput = {};
    if (status) where.status = status as Prisma.GenerationJobWhereInput["status"];
    if (styleId) where.styleId = styleId;
    if (search) where.ideaPromptSnapshot = { contains: search };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const jobs = await prisma.generationJob.findMany({
      where,
      include: { images: true, batch: true },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = jobs.length > PAGE_SIZE;
    const page = hasMore ? jobs.slice(0, PAGE_SIZE) : jobs;

    return NextResponse.json({
      jobs: serializeBigInts(page),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
