"use client";

import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistoryList, useResyncBatch, type HistoryFilters } from "@/hooks/use-history";
import { QuickUpscaleButton } from "@/components/history/quick-upscale-button";
import { RegenerateButton } from "@/components/history/regenerate-button";
import { BatchUpscaleButton } from "@/components/history/batch-upscale-button";
import { BackCoverDownloadButton } from "@/components/history/back-cover-download-button";
import { OpenFolderButton } from "@/components/history/open-folder-button";
import { EtsyMetadataCard } from "@/components/history/etsy-metadata-card";

const STATUS_LABEL: Record<string, string> = {
  queued: "Đang chờ",
  running: "Đang tạo",
  completed: "Hoàn thành",
  failed: "Thất bại",
  unknown: "Không xác định",
};

export function HistoryGrid({ filters }: { filters: HistoryFilters }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useHistoryList(filters);
  const resyncMutation = useResyncBatch();

  function handleResync(batchId: string) {
    resyncMutation.mutate(batchId, {
      onSuccess: () => toast.success("Đã đồng bộ lại từ ComfyUI"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Đồng bộ thất bại"),
    });
  }

  const jobs = data?.pages.flatMap((page) => page.jobs) ?? [];

  const groups: {
    batchId: string;
    ideaPrompt: string;
    createdAt: string;
    backCoverStatus: "done" | "failed" | null;
    finalExportStatus: "done" | "failed" | null;
    etsyTitle: string | null;
    etsyDescription: string | null;
    etsyTagsJson: string | null;
    jobs: typeof jobs;
  }[] = [];
  for (const job of jobs) {
    const last = groups[groups.length - 1];
    if (last && last.batchId === job.batchId) {
      last.jobs.push(job);
    } else {
      groups.push({
        batchId: job.batchId,
        ideaPrompt: job.batch.ideaPrompt,
        createdAt: job.batch.createdAt,
        backCoverStatus: job.batch.backCoverStatus,
        finalExportStatus: job.batch.finalExportStatus,
        etsyTitle: job.batch.etsyTitle,
        etsyDescription: job.batch.etsyDescription,
        etsyTagsJson: job.batch.etsyTagsJson,
        jobs: [job],
      });
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Chưa có kết quả nào.</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.batchId} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{group.ideaPrompt}</p>
              <p className="text-xs text-muted-foreground">
                Xem kỹ ảnh bên dưới. Ưng ý thì chọn khổ lịch rồi bấm &quot;Hoàn thiện &amp; xuất file in&quot;.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BatchUpscaleButton batchId={group.batchId} />
              <BackCoverDownloadButton batchId={group.batchId} status={group.backCoverStatus} />
              <OpenFolderButton batchId={group.batchId} status={group.finalExportStatus} />
              {group.jobs.some((job) => job.status !== "completed") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleResync(group.batchId)}
                  disabled={resyncMutation.isPending}
                >
                  <RefreshCcw className={resyncMutation.isPending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                  Đồng bộ lại
                </Button>
              )}
              <p className="shrink-0 text-xs text-muted-foreground">{new Date(group.createdAt).toLocaleString("vi-VN")}</p>
            </div>
          </div>
          <EtsyMetadataCard
            title={group.etsyTitle}
            description={group.etsyDescription}
            tagsJson={group.etsyTagsJson}
          />
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {group.jobs.map((job) => (
              <div
                key={job.id}
                className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
              >
                <Link href={`/history/${job.id}`} className="block h-full w-full">
                  {job.images[0] ? (
                    <Image
                      src={`/api/images/${job.images[0].id}`}
                      alt={job.styleNameSnapshot ?? "Ảnh đã tạo"}
                      fill
                      unoptimized
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {STATUS_LABEL[job.status]}
                    </div>
                  )}
                  <Badge variant="secondary" className="absolute bottom-1.5 left-1.5 text-[10px]">
                    {job.styleNameSnapshot ?? "—"}
                  </Badge>
                </Link>
                {job.images[0] && (
                  <>
                    <div className="pointer-events-none absolute inset-0 bg-black/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                    <QuickUpscaleButton
                      imageId={job.images[0].id}
                      done={job.images[0].upscaleStatus === "done"}
                      className="absolute right-1.5 top-1.5"
                    />
                    <RegenerateButton
                      jobId={job.id}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-90 opacity-0 transition-all duration-150 group-hover:scale-100 group-hover:opacity-100"
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tải thêm"}
          </Button>
        </div>
      )}
    </div>
  );
}
