"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Copy, Download, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useJobDetail, useRegenerateJob } from "@/hooks/use-history";

const STATUS_LABEL: Record<string, string> = {
  queued: "Đang chờ",
  running: "Đang tạo",
  completed: "Hoàn thành",
  failed: "Thất bại",
  unknown: "Không xác định",
};

function copyToClipboard(text: string, label: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`Đã copy ${label}`))
    .catch(() => toast.error("Không copy được"));
}

export function JobDetail({ jobId }: { jobId: string }) {
  const { data: job, isLoading } = useJobDetail(jobId);
  const regenerateMutation = useRegenerateJob();
  const [seedMode, setSeedMode] = useState<"same" | "random">("random");

  if (isLoading || !job) {
    return <Skeleton className="h-96 w-full" />;
  }

  function handleRegenerate() {
    regenerateMutation.mutate(
      { jobId, seedMode },
      {
        onSuccess: () => toast.success("Đã tạo job mới từ snapshot này"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Tạo lại thất bại"),
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        {job.images[0] ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-md border">
            <Image src={`/api/images/${job.images[0].id}`} alt="Ảnh đã tạo" fill unoptimized className="object-contain bg-muted" />
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            {job.errorMessage ?? STATUS_LABEL[job.status]}
          </div>
        )}
        {job.images[0] && (
          <Button variant="outline" render={<a href={`/api/images/${job.images[0].id}/download`} download />}>
            <Download className="h-4 w-4" /> Tải ảnh
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{STATUS_LABEL[job.status]}</Badge>
          {job.styleNameSnapshot && <Badge variant="secondary">{job.styleNameSnapshot}</Badge>}
        </div>

        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <div>
              <p className="font-medium">Ý tưởng chung</p>
              <p className="text-muted-foreground">{job.ideaPromptSnapshot}</p>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">Positive final</p>
                <p className="text-muted-foreground">{job.positiveFinal || "—"}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => copyToClipboard(job.positiveFinal, "positive")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">Negative final</p>
                <p className="text-muted-foreground">{job.negativeFinal || "—"}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => copyToClipboard(job.negativeFinal, "negative")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm">
            <div><p className="text-muted-foreground">Seed</p><p>{job.seed ?? "—"}</p></div>
            <div><p className="text-muted-foreground">Kích thước</p><p>{job.width ?? "—"}×{job.height ?? "—"}</p></div>
            <div><p className="text-muted-foreground">Steps</p><p>{job.steps ?? "—"}</p></div>
            <div><p className="text-muted-foreground">CFG</p><p>{job.cfg ?? "—"}</p></div>
            <div><p className="text-muted-foreground">Bắt đầu</p><p>{job.startedAt ? new Date(job.startedAt).toLocaleString("vi-VN") : "—"}</p></div>
            <div><p className="text-muted-foreground">Kết thúc</p><p>{job.finishedAt ? new Date(job.finishedAt).toLocaleString("vi-VN") : "—"}</p></div>
            <div className="col-span-2"><p className="text-muted-foreground">ComfyUI prompt ID</p><p className="truncate">{job.promptId ?? "—"}</p></div>
            {job.errorMessage && (
              <div className="col-span-2"><p className="text-muted-foreground">Lỗi</p><p className="text-red-700">{job.errorMessage}</p></div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Select value={seedMode} onValueChange={(v) => { if (typeof v === "string") setSeedMode(v as "same" | "random"); }}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="random">Tạo lại với seed ngẫu nhiên mới</SelectItem>
              <SelectItem value="same">Tạo lại với seed cũ</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleRegenerate} disabled={regenerateMutation.isPending}>
            <RefreshCcw className="h-4 w-4" /> {regenerateMutation.isPending ? "Đang gửi..." : "Tạo lại"}
          </Button>
        </div>
      </div>
    </div>
  );
}
