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
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  queued: "Đang chờ",
  running: "Đang tạo",
  completed: "Hoàn thành",
  failed: "Thất bại",
  unknown: "Không xác định",
};

const MASK_STATUS_LABEL: Record<string, string> = {
  censored: "Đã che vùng nhạy cảm",
  clean: "Ảnh sạch, không cần che",
  failed: "Lỗi khi che ảnh",
  skipped: "Chưa cấu hình che ảnh",
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
  const [variant, setVariant] = useState<"original" | "masked">("original");

  if (isLoading || !job) {
    return <Skeleton className="h-96 w-full" />;
  }

  const image = job.images[0];
  const hasMasked = Boolean(image?.maskedRelativePath);
  const activeVariant = hasMasked ? variant : "original";
  const imageSrc = image ? `/api/images/${image.id}${activeVariant === "masked" ? "?variant=masked" : ""}` : null;
  const downloadHref = image ? `/api/images/${image.id}/download${activeVariant === "masked" ? "?variant=masked" : ""}` : null;

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
        {imageSrc ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-md border">
            <Image src={imageSrc} alt="Ảnh đã tạo" fill unoptimized className="object-contain bg-muted" />
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            {job.errorMessage ?? STATUS_LABEL[job.status]}
          </div>
        )}

        {image && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setVariant("original")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  activeVariant === "original" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Bản gốc
              </button>
              <button
                type="button"
                onClick={() => hasMasked && setVariant("masked")}
                disabled={!hasMasked}
                title={hasMasked ? undefined : "Chưa có bản đã che cho ảnh này"}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  activeVariant === "masked" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Bản đã che
              </button>
            </div>
            {image.maskStatus && (
              <Badge variant={image.maskStatus === "censored" ? "default" : image.maskStatus === "failed" ? "destructive" : "secondary"}>
                {MASK_STATUS_LABEL[image.maskStatus] ?? image.maskStatus}
              </Badge>
            )}
          </div>
        )}

        {downloadHref && (
          <Button variant="outline" render={<a href={downloadHref} download />}>
            <Download className="h-4 w-4" /> Tải {activeVariant === "masked" ? "bản đã che" : "ảnh"}
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{STATUS_LABEL[job.status]}</Badge>
          {job.styleNameSnapshot && <Badge variant="secondary">Style: {job.styleNameSnapshot}</Badge>}
          {job.sceneNameSnapshot && <Badge variant="secondary">Bối cảnh: {job.sceneNameSnapshot}</Badge>}
          {job.poseNameSnapshot && <Badge variant="secondary">Tư thế: {job.poseNameSnapshot}</Badge>}
        </div>

        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
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
