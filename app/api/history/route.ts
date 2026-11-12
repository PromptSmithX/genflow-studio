import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api/errors";
import { serializeBigInts } from "@/lib/api/serialize";
import type { Prisma } from "@prisma/client";
import { getActiveDraftBatchId } from "@/lib/generations/draft-queue";

export const runtime = "nodejs";

// Phân trang theo BỘ LỊCH (batch) chứ không theo ảnh, để mỗi thẻ ở trang Kết
// quả luôn có đủ ảnh của bộ đó và tiến độ "x/13" không bị sai do cắt trang.
const PAGE_SIZE = 5;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const search = searchParams.get("search")?.trim();

    const where: Prisma.GenerationBatchWhereInput = {};
    if (search) where.ideaPrompt = { contains: search };

    const batches = await prisma.generationBatch.findMany({
      where,
      include: { jobs: { include: { images: true }, orderBy: { indexInBatch: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = batches.length > PAGE_SIZE;
    const page = hasMore ? batches.slice(0, PAGE_SIZE) : batches;
    const activeDraftId = getActiveDraftBatchId();

    return NextResponse.json({
      batches: serializeBigInts(
        page.map((batch) => ({
          ...batch,
          draftState:
            batch.status !== "drafting"
              ? null
              : batch.draftError
                ? "draft_failed"
                : batch.id === activeDraftId
                  ? "drafting"
                  : "waiting",
        })),
      ),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
