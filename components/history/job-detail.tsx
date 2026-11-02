"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Copy, Download, Loader2, Printer, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useJobDetail, useRegenerateJob } from "@/hooks/use-history";
import { useCalendarFormats, resolveDefaultFormatId, CALENDAR_FORMAT_STORAGE_KEY } from "@/hooks/use-calendar-formats";
import { useUpscaleImage } from "@/hooks/use-upscale";
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

type Variant = "original" | "masked" | "upscaled" | "upscaled-masked";

function copyToClipboard(text: string, label: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`Đã copy ${label}`))
    .catch(() => toast.error("Không copy được"));
}

export function JobDetail({ jobId }: { jobId: string }) {
  const { data: job, isLoading } = useJobDetail(jobId);
  const regenerateMutation = useRegenerateJob();
  const upscaleMutation = useUpscaleImage();
  const { data: formatsData } = useCalendarFormats();
  const [seedMode, setSeedMode] = useState<"same" | "random">("random");
  const [variant, setVariant] = useState<Variant>("original");
  const [formatId, setFormatId] = useState<string>("");
  const [formatDefaulted, setFormatDefaulted] = useState(false);

  const formats = formatsData?.formats ?? [];

  // Mặc định khổ lịch một lần khi danh sách tải xong: nhớ lựa chọn gần nhất
  // (localStorage), nếu chưa có thì lấy khổ lớn nhất. Điều chỉnh state khi render
  // (giống DefaultsCard) thay vì trong effect để tránh cascading renders.
  if (!formatDefaulted && formats.length > 0) {
    setFormatDefaulted(true);
    const resolved = resolveDefaultFormatId(formats);
    if (resolved) setFormatId(resolved);
  }

  function handleFormatChange(value: string) {
    setFormatId(value);
    try {
      localStorage.setItem(CALENDAR_FORMAT_STORAGE_KEY, value);
    } catch {
      // Chế độ riêng tư / chặn storage: bỏ qua, chỉ mất tiện ích nhớ lựa chọn.
    }
  }

  if (isLoading || !job) {
    return <Skeleton className="h-96 w-full" />;
  }

  const image = job.images[0];
  const hasMasked = Boolean(image?.maskedRelativePath);
  const hasUpscaled = Boolean(image?.upscaledRelativePath);
  const hasUpscaledMasked = Boolean(image?.upscaledMaskedRelativePath);

  const variantOptions: { key: Variant; label: string; available: boolean }[] = [
    { key: "original", label: "Bản gốc", available: true },
    { key: "masked", label: "Bản đã che", available: hasMasked },
    { key: "upscaled", label: "Bản in (gốc)", available: hasUpscaled },
    { key: "upscaled-masked", label: "Bản in (đã che)", available: hasUpscaledMasked },
  ];

  const current = variantOptions.find((o) => o.key === variant);
  const activeVariant: Variant = current?.available ? variant : "original";
  const variantQuery = activeVariant === "original" ? "" : `?variant=${activeVariant}`;
  const imageSrc = image ? `/api/images/${image.id}${variantQuery}` : null;
  const downloadHref = image ? `/api/images/${image.id}/download${variantQuery}` : null;
  const isPrintVariant = activeVariant === "upscaled" || activeVariant === "upscaled-masked";

  function handleRegenerate() {
    regenerateMutation.mutate(
      { jobId, seedMode },
      {
        onSuccess: () => toast.success("Đã tạo job mới từ snapshot này"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Tạo lại thất bại"),
      },
    );
  }

  function handleUpscale() {
    if (!image || !formatId) return;
    upscaleMutation.mutate(
      { imageId: image.id, formatId },
      {
        onSuccess: () => toast.success("Đã hoàn thiện ảnh để in"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Hoàn thiện thất bại"),
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
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-1">
              {variantOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => option.available && setVariant(option.key)}
                  disabled={!option.available}
                  title={option.available ? undefined : "Chưa có bản này"}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    activeVariant === option.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
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
            <Download className="h-4 w-4" /> Tải {isPrintVariant ? "bản in" : activeVariant === "masked" ? "bản đã che" : "ảnh"}
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

        {image && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Hoàn thiện ảnh để in lịch</p>
                {image.upscaleStatus === "done" ? (
                  <Badge variant="default">
                    Đã hoàn thiện {image.upscaledWidth}×{image.upscaledHeight}
                  </Badge>
                ) : image.upscaleStatus === "failed" ? (
                  <Badge variant="destructive">Hoàn thiện lỗi</Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Phóng ảnh lên đúng khổ trang in (300 DPI) cho cả bản gốc và bản đã che.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={formatId} onValueChange={(v) => { if (typeof v === "string") handleFormatChange(v); }}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder={formats.length ? "Chọn khổ lịch" : "Không có template"} />
                  </SelectTrigger>
                  <SelectContent>
                    {formats.map((format) => (
                      <SelectItem key={format.id} value={format.id}>
                        {format.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleUpscale} disabled={upscaleMutation.isPending || !formatId}>
                  {upscaleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  {upscaleMutation.isPending ? "Đang xử lý..." : image.upscaleStatus === "done" ? "Hoàn thiện lại" : "Hoàn thiện để in"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
