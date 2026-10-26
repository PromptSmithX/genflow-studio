"use client";

import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, RefreshCcw, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBatch } from "@/hooks/use-generations";
import { useRegenerateJob } from "@/hooks/use-history";
import type { JobStatusDTO } from "@/lib/types";

const STATUS_LABEL: Record<JobStatusDTO, string> = {
  queued: "Đang chờ",
  running: "Đang tạo",
  completed: "Hoàn thành",
  failed: "Thất bại",
  unknown: "Không xác định",
};

function StatusBadge({ status }: { status: JobStatusDTO }) {
  const Icon = status === "completed" ? CheckCircle2 : status === "failed" ? XCircle : status === "running" ? Loader2 : Clock;
  const color =
    status === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "failed" || status === "unknown"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <Badge variant="outline" className={color}>
      <Icon className={status === "running" ? "h-3 w-3 animate-spin" : "h-3 w-3"} /> {STATUS_LABEL[status]}
    </Badge>
  );
}

export function BatchTracker({ batchId, onReset }: { batchId: string; onReset: () => void }) {
  const { data: batch, isLoading } = useBatch(batchId);
  const regenerateMutation = useRegenerateJob();

  function handleRetry(jobId: string) {
    regenerateMutation.mutate(
      { jobId, seedMode: "random" },
      {
        onSuccess: () => toast.success("Đã gửi lại yêu cầu tạo ảnh"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Thử lại thất bại"),
      },
    );
  }

  if (isLoading || !batch) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải trạng thái batch...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Batch: {batch.ideaPrompt}</p>
            <p className="text-xs text-muted-foreground">{batch.jobs.length} ảnh · trạng thái: {batch.status}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" render={<Link href="/history">Mở lịch sử</Link>} />
            <Button variant="ghost" size="sm" onClick={onReset}>
              Tạo batch mới
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {batch.jobs.map((job) => (
            <div key={job.id} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Ảnh {job.indexInBatch + 1}</span>
                <StatusBadge status={job.status} />
              </div>
              <p className="text-xs text-muted-foreground">{job.styleNameSnapshot ?? "—"}</p>

              {job.images.length > 0 ? (
                <div className="grid grid-cols-2 gap-1">
                  {job.images.map((image) => (
                    <Link key={image.id} href={`/history/${job.id}`} className="block overflow-hidden rounded-sm border">
                      <Image
                        src={`/api/images/${image.id}`}
                        alt={job.styleNameSnapshot ?? "Ảnh đã tạo"}
                        width={200}
                        height={200}
                        className="aspect-square w-full object-cover"
                        unoptimized
                      />
                    </Link>
                  ))}
                </div>
              ) : job.status === "failed" || job.status === "unknown" ? (
                <div className="space-y-2">
                  <p className="text-xs text-red-700">{job.errorMessage ?? "Có lỗi xảy ra"}</p>
                  <Button size="sm" variant="outline" onClick={() => handleRetry(job.id)} disabled={regenerateMutation.isPending}>
                    <RefreshCcw className="h-3 w-3" /> Thử lại
                  </Button>
                </div>
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-sm border border-dashed text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
