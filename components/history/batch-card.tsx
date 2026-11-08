"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  Folder,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BatchUpscaleButton } from "@/components/history/batch-upscale-button";
import { BackCoverDownloadButton } from "@/components/history/back-cover-download-button";
import { OpenFolderButton } from "@/components/history/open-folder-button";
import { EtsyMetadataCard } from "@/components/history/etsy-metadata-card";
import { BatchMockupSection } from "@/components/history/batch-mockup-section";
import { RegenerateButton } from "@/components/history/regenerate-button";
import { PipelineProgress } from "@/components/history/pipeline-progress";
import { useResyncBatch, useAutoPublishBatch } from "@/hooks/use-history";
import { useAdvancedMode } from "@/hooks/use-settings";
import { useSheetUrl } from "@/hooks/use-sheets";
import { slotLabel } from "@/lib/calendar/slot-label";
import type { GenerationBatchDTO, GenerationJobDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = ["Tạo ảnh", "Kiểm tra & sửa", "Xuất file in", "Mockup & Etsy"] as const;

function isPending(job: GenerationJobDTO) {
  return job.status === "queued" || job.status === "running";
}

function isProblem(job: GenerationJobDTO) {
  return job.status === "failed" || job.status === "unknown" || (job.status === "completed" && !job.images[0]);
}

function aspectOf(job: GenerationJobDTO) {
  return job.width && job.height ? `${job.width} / ${job.height}` : "1152 / 952";
}

function renderAutoStatusBadge(status?: string | null) {
  if (!status || status === "legacy") return null;

  switch (status) {
    case "pending":
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-xs">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Đang chờ
        </Badge>
      );
    case "retrying":
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-xs">
          <RefreshCcw className="mr-1 h-3 w-3 animate-spin" />
          Đang gen lại ảnh lỗi
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="secondary" className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-xs">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Đang xử lý
        </Badge>
      );
    case "done":
      return (
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs">
          <Check className="mr-1 h-3 w-3" />
          Hoàn tất
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-xs">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Lỗi
        </Badge>
      );
    case "skipped":
      return (
        <Badge variant="secondary" className="text-xs">
          Bỏ qua
        </Badge>
      );
    default:
      return null;
  }
}

function renderUnifiedStatusBadge(
  batch: GenerationBatchDTO,
  pendingCount: number,
  readyCount: number,
  total: number,
  problemCount: number,
  exported: boolean,
) {
  if (batch.autoStatus === "done") {
    return (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs">
        <Check className="mr-1 h-3 w-3" />
        Hoàn tất
      </Badge>
    );
  }
  if (batch.autoStatus === "retrying") {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-xs">
        <RefreshCcw className="mr-1 h-3 w-3 animate-spin" />
        Đang tạo lại ảnh lỗi
      </Badge>
    );
  }
  if (batch.autoStatus === "processing") {
    let text = "Đang xử lý";
    if (batch.autoStage === "export") text = "Đang chuẩn bị file in & mockup";
    else if (batch.autoStage === "r2") text = "Đang lưu kho dữ liệu";
    else if (batch.autoStage === "sheet") text = "Đang ghi Google Sheet";
    else if (pendingCount > 0) text = `Đang tạo ảnh ${readyCount}/${total}`;

    return (
      <Badge variant="secondary" className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-xs">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        {text}
      </Badge>
    );
  }
  if (batch.autoStatus === "failed") {
    return (
      <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-xs">
        <AlertTriangle className="mr-1 h-3 w-3" />
        Lỗi xử lý
      </Badge>
    );
  }
  if (batch.autoStatus === "skipped") {
    return (
      <Badge variant="secondary" className="text-xs">
        Bỏ qua tự động
      </Badge>
    );
  }
  if (pendingCount > 0) {
    return (
      <Badge variant="secondary" className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-xs">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Đang tạo ảnh {readyCount}/{total}
      </Badge>
    );
  }
  if (problemCount > 0) {
    return (
      <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-xs">
        <AlertTriangle className="mr-1 h-3 w-3" />
        {problemCount} ảnh lỗi
      </Badge>
    );
  }
  if (exported) {
    return (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs">
        <Check className="mr-1 h-3 w-3" />
        Hoàn tất
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-xs">
      Chờ xử lý
    </Badge>
  );
}

export function BatchCard({ batch, defaultOpen }: { batch: GenerationBatchDTO; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const advancedMode = useAdvancedMode();
  const sheetUrl = useSheetUrl();
  const resyncMutation = useResyncBatch();
  const autoPublishMutation = useAutoPublishBatch();

  const canRetryAuto =
    batch.autoStatus === "failed" || batch.autoStatus === "legacy" || batch.autoStatus === "skipped";

  function handleRetryAuto(e: React.MouseEvent) {
    e.stopPropagation();
    autoPublishMutation.mutate(batch.id, {
      onSuccess: () => toast.success("Đã kích hoạt chạy lại tự động"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Chạy lại tự động thất bại"),
    });
  }

  const jobs = [...batch.jobs].sort((a, b) => a.indexInBatch - b.indexInBatch);
  const total = batch.requestedCount || jobs.length || 13;
  const pendingCount = jobs.filter(isPending).length;
  const problemCount = jobs.filter(isProblem).length;
  const readyCount = total - pendingCount - problemCount;
  const exported = batch.finalExportStatus === "done";
  // Đã từng xuất (còn slug) nhưng status bị reset do sửa lại ảnh -> thư mục trên máy đang cũ.
  const exportStale = !exported && Boolean(batch.finalExportRelativePath);
  const hasBackCover = exported && batch.backCoverStatus === "done";
  const version = new Date(batch.updatedAt).getTime();

  // 0..3 = bước đang làm, 4 = xong hết.
  const currentStep = pendingCount > 0 ? 0 : problemCount > 0 ? 1 : !exported ? 2 : batch.mockupStatus === "done" ? 4 : 3;

  const summary =
    pendingCount > 0
      ? { text: `Đang tạo ảnh ${readyCount + problemCount}/${total}`, tone: "info" as const }
      : problemCount > 0
        ? { text: `${problemCount} ảnh lỗi — cần sửa lại`, tone: "danger" as const }
        : exportStale
          ? { text: "Cần xuất lại file in", tone: "warn" as const }
          : !exported
            ? { text: "Đã tạo xong — chờ xuất file in", tone: "warn" as const }
            : { text: "Hoàn tất", tone: "success" as const };

  function handleResync() {
    resyncMutation.mutate(batch.id, {
      onSuccess: () => toast.success("Đã kiểm tra lại với máy tạo ảnh"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Kiểm tra lại thất bại"),
    });
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-muted/40 cursor-pointer"
        aria-expanded={open}
      >
        <div className="min-w-0 space-y-1">
          <p className="line-clamp-2 font-medium">{batch.ideaPrompt || "Bộ lịch không tên"}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{new Date(batch.createdAt).toLocaleString("vi-VN")}</span>
            <span>·</span>
            <span>{total} ảnh</span>
            {advancedMode && batch.r2SkuBase && (
              <>
                <span>·</span>
                <span className="font-mono text-xs">SKU: {batch.r2SkuBase}</span>
              </>
            )}
            {advancedMode && batch.r2Status === "done" && (
              <Badge variant="secondary" className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-xs">
                Đã đẩy R2
              </Badge>
            )}
            {advancedMode ? (
              <>
                {renderAutoStatusBadge(batch.autoStatus)}
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs",
                    summary.tone === "success" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                    summary.tone === "warn" && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
                    summary.tone === "danger" && "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
                    summary.tone === "info" && "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
                  )}
                >
                  {pendingCount > 0 && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  {summary.text}
                </Badge>
              </>
            ) : (
              renderUnifiedStatusBadge(batch, pendingCount, readyCount, total, problemCount, exported)
            )}
          </div>
          {advancedMode && batch.autoError && (
            <p className="text-xs text-red-600 dark:text-red-400 line-clamp-1" title={batch.autoError}>
              {batch.autoError}
            </p>
          )}
          {!open && (
            <div className="flex gap-1 pt-1">
              {jobs
                .filter((job) => job.images[0])
                .slice(0, 6)
                .map((job) => (
                  <div key={job.id} className="relative h-10 w-12 overflow-hidden rounded border bg-muted">
                    <Image src={`/api/images/${job.images[0].id}`} alt="" fill unoptimized className="object-cover" />
                  </div>
                ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {advancedMode && canRetryAuto && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs shrink-0"
              onClick={handleRetryAuto}
              disabled={autoPublishMutation.isPending}
            >
              {autoPublishMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="mr-1 h-3.5 w-3.5" />
              )}
              Chạy lại tự động
            </Button>
          )}
          {open ? (
            <ChevronUp className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-6 border-t p-4">
          {!advancedMode ? (
            <>
              <PipelineProgress batch={batch} />

              {batch.autoStatus === "done" && (
                <div className="space-y-4">
                  {batch.autoError && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>{batch.autoError}</span>
                    </div>
                  )}

                  {sheetUrl ? (
                    <Button
                      size="lg"
                      className="w-full text-base font-semibold"
                      nativeButton={false}
                      render={<a href={sheetUrl} target="_blank" rel="noopener noreferrer" />}
                    >
                      <FileSpreadsheet className="h-5 w-5" /> Mở Google Sheet
                    </Button>
                  ) : (
                    <Button size="lg" className="w-full text-base font-semibold" disabled title="Chưa cấu hình Google Sheet">
                      <FileSpreadsheet className="h-5 w-5" /> Mở Google Sheet
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <Stepper current={currentStep} />

              {pendingCount > 0 && (
                <div className="space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.round(((total - pendingCount) / Math.max(total, 1)) * 100)}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Mỗi ảnh mất khoảng 1 phút. Trang tự cập nhật, bạn không cần tải lại. Có thể chuyển sang việc khác.
                    </span>
                    <Button variant="ghost" size="sm" onClick={handleResync} disabled={resyncMutation.isPending}>
                      <RefreshCcw className={resyncMutation.isPending ? "animate-spin" : undefined} />
                      Ảnh lâu chưa hiện? Kiểm tra lại
                    </Button>
                  </div>
                </div>
              )}

              {exportStale && pendingCount === 0 && (
                <Notice tone="warn">
                  Có ảnh vừa được sửa lại nên thư mục trên máy và ảnh mockup đang là bản cũ. Hãy bấm{" "}
                  <strong>Xuất lại file in</strong> để cập nhật.
                </Notice>
              )}

              {problemCount > 0 && pendingCount === 0 && (
                <Notice tone="danger">
                  Có {problemCount} ảnh bị lỗi. Bấm <strong>Sửa lại</strong> dưới ảnh đó để AI viết mô tả mới và tạo lại.
                </Notice>
              )}
            </>
          )}

          {/* Common Image Grid + Back Cover */}
          <section className="space-y-2">
            <div>
              <p className="text-sm font-medium">Ảnh trong bộ lịch</p>
              <p className="text-xs text-muted-foreground">
                {advancedMode
                  ? "Bấm vào ảnh để xem lớn. Ảnh nào chưa ưng thì bấm \"Sửa lại\"."
                  : "Bấm vào ảnh để xem lớn."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {jobs.map((job) => (
                <ImageTile
                  key={job.id}
                  job={job}
                  exported={exported}
                  advancedMode={advancedMode}
                  autoStatus={batch.autoStatus}
                />
              ))}
              {hasBackCover && (
                <div className="overflow-hidden rounded-md border bg-card">
                  <div className="relative bg-muted" style={{ aspectRatio: aspectOf(jobs[0]) }}>
                    <Image
                      src={`/api/generations/${batch.id}/back-cover?v=${version}`}
                      alt="Bìa sau"
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2">
                    <span className="text-sm font-medium">Bìa sau</span>
                    <span className="text-xs text-muted-foreground">App tự ghép</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Advanced Mode: Export & Mockup sections */}
          {advancedMode && (
            <>
              {pendingCount === 0 && readyCount > 0 && (
                <section className="space-y-3 rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">{exported ? "File in đã xuất" : "Xuất file in"}</p>
                    <p className="text-xs text-muted-foreground">
                      {exported
                        ? "Muốn đổi khổ lịch hoặc vừa sửa ảnh? Chọn khổ rồi bấm Xuất lại."
                        : "Ưng ý hết rồi thì chọn khổ lịch và bấm Xuất file in. App sẽ phóng to ảnh, ghép bìa sau và tạo mockup."}
                    </p>
                  </div>
                  {problemCount > 0 && !exported && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Nên sửa ảnh lỗi trước — nếu thiếu trang, thư mục sẽ không đủ và không tạo được mockup.
                    </p>
                  )}
                  <BatchUpscaleButton batchId={batch.id} imageCount={readyCount} isReExport={exported || exportStale} />

                  {exported && batch.finalExportRelativePath && (
                    <FolderSummary
                      batch={batch}
                      pageCount={readyCount + (hasBackCover ? 1 : 0)}
                      hasEtsy={Boolean(batch.etsyTitle || batch.etsyDescription || batch.etsyTagsJson)}
                    />
                  )}
                </section>
              )}

              {exported && (
                <section className="space-y-6 rounded-lg border p-4">
                  <BatchMockupSection batchId={batch.id} mockupStatus={batch.mockupStatus} />
                  <EtsyMetadataCard
                    title={batch.etsyTitle}
                    description={batch.etsyDescription}
                    tagsJson={batch.etsyTagsJson}
                  />
                </section>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
              done && "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
              active && "border-primary bg-primary/5 font-medium text-foreground",
              !done && !active && "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                done ? "bg-emerald-600 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function Notice({ tone, children }: { tone: "warn" | "danger"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
        tone === "danger" && "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function ImageTile({
  job,
  exported,
  advancedMode,
  autoStatus,
}: {
  job: GenerationJobDTO;
  exported: boolean;
  advancedMode: boolean;
  autoStatus?: string | null;
}) {
  const label = slotLabel(job.indexInBatch);
  const image = job.images[0];
  const pending = isPending(job);
  const isAutoSyncing = !advancedMode && (autoStatus === "pending" || autoStatus === "processing");

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-card",
        isProblem(job) && !pending && "border-red-300 dark:border-red-900",
      )}
    >
      <Link
        href={`/history/${job.id}`}
        className="group relative block bg-muted"
        style={{ aspectRatio: aspectOf(job) }}
      >
        {image ? (
          <Image
            src={`/api/images/${image.id}`}
            alt={label}
            fill
            unoptimized
            className="object-cover transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
            {pending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {job.status === "running" ? "Đang tạo..." : "Đang chờ tới lượt"}
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="text-red-700 dark:text-red-400">Tạo ảnh bị lỗi</span>
                {!advancedMode && (
                  <span className="text-xs text-muted-foreground">Bấm Tạo lại để thử lại</span>
                )}
              </>
            )}
          </div>
        )}
      </Link>
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="truncate text-sm font-medium">{label}</span>
        {!pending && (
          <RegenerateButton
            jobId={job.id}
            label={label}
            exported={exported}
            simple={!advancedMode}
            disabled={isAutoSyncing}
            title={isAutoSyncing ? "Đang cập nhật kho & Google Sheet, đợi xong rồi thử lại" : undefined}
          />
        )}
      </div>
    </div>
  );
}

function FolderSummary({
  batch,
  pageCount,
  hasEtsy,
}: {
  batch: GenerationBatchDTO;
  pageCount: number;
  hasEtsy: boolean;
}) {
  const rows = [
    { name: "khong-che", desc: `${pageCount} trang bản gốc — dùng để in`, icon: Folder },
    { name: "da-che", desc: `${pageCount} trang bản đã che — dùng để đăng bán`, icon: Folder },
    ...(batch.mockupStatus === "done" ? [{ name: "mockup", desc: "5 ảnh phối cảnh sản phẩm", icon: Folder }] : []),
    ...(hasEtsy ? [{ name: "etsy.txt", desc: "Tiêu đề, mô tả, từ khoá Etsy", icon: FileText }] : []),
  ];

  return (
    <div className="space-y-2 rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">
        Thư mục trên máy: <code className="break-all">{batch.finalExportRelativePath}</code>
      </p>
      <ul className="space-y-1 text-sm">
        {rows.map(({ name, desc, icon: Icon }) => (
          <li key={name} className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <code className="text-xs">{name}</code>
            <span className="text-xs text-muted-foreground">— {desc}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        <OpenFolderButton batchId={batch.id} status={batch.finalExportStatus} />
        <BackCoverDownloadButton batchId={batch.id} status={batch.backCoverStatus} version={new Date(batch.updatedAt).getTime()} />
      </div>
    </div>
  );
}
