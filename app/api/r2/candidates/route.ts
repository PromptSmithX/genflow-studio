import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api/errors";
import { isBatchEligible } from "@/lib/r2/push-batches";

export const runtime = "nodejs";

export async function GET() {
  try {
    const batches = await prisma.generationBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        jobs: {
          include: { images: true },
          orderBy: { indexInBatch: "asc" },
        },
      },
    });

    const candidates = batches.map((batch) => {
      const coverJob = batch.jobs.find((j) => j.indexInBatch === 0);
      const coverImageId = coverJob?.images?.[0]?.id ?? null;
      const { eligible, reason } = isBatchEligible(batch);

      return {
        id: batch.id,
        etsyTitle: batch.etsyTitle,
        createdAt: batch.createdAt,
        coverImageId,
        eligible,
        reason: eligible ? undefined : reason,
        r2SkuBase: batch.r2SkuBase,
        r2Status: batch.r2Status,
        r2PushedAt: batch.r2PushedAt,
        r2Error: batch.r2Error,
      };
    });

    return NextResponse.json(candidates);
  } catch (error) {
    return handleApiError(error);
  }
}
