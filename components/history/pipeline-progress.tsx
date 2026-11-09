"use client";

import { AlertTriangle, Check, Circle, Cloud, FileSpreadsheet, Layers, Loader2, RefreshCcw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAutoPublishBatch } from "@/hooks/use-history";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GenerationBatchDTO } from "@/lib/types";

export type StepState = "waiting" | "active" | "done" | "error";

export interface PipelineDerivedState {
  step1State: StepState;
  step2State: StepState;
  step3State: StepState;
  step4State: StepState;
  overallPercent: number;
}

export function derivePipelineStepStates(input: {
  autoStatus?: string | null;
  autoStage?: string | null;
  readyCount: number;
  total: number;
  pendingCount?: number;
  problemCount?: number;
}): PipelineDerivedState {
  const {
    autoStatus,
    autoStage,
    readyCount,
    total,
    pendingCount = 0,
    problemCount = 0,
  } = input;

  const isDone = autoStatus === "done";
  const isFailed = autoStatus === "failed";
  const isRetrying = autoStatus === "retrying";
  const isSkipped = autoStatus === "skipped";
  const isProcessing = autoStatus === "processing";

  let step1State: StepState = "waiting";
  let step2State: StepState = "waiting";
  let step3State: StepState = "waiting";
  let step4State: StepState = "waiting";

  if (isDone) {
    step1State = "done";
    step2State = "done";
    step3State = "done";
    step4State = "done";
  } else if (isFailed) {
    if (autoStage === "sheet") {
      step1State = "done";
      step2State = "done";
      step3State = "done";
      step4State = "error";
    } else if (autoStage === "r2") {
      step1State = "done";
      step2State = "done";
      step3State = "error";
      step4State = "waiting";
    } else if (autoStage === "export") {
      step1State = "done";
      step2State = "error";
      step3State = "waiting";
      step4State = "waiting";
    } else {
      if (problemCount > 0 || readyCount < total) {
        step1State = "error";
        step2State = "waiting";
        step3State = "waiting";
        step4State = "waiting";
      } else {
        step1State = "done";
        step2State = "waiting";
        step3State = "waiting";
        step4State = "waiting";
      }
    }
  } else if (isRetrying) {
    step1State = "active";
    step2State = "waiting";
    step3State = "waiting";
    step4State = "waiting";
  } else if (isSkipped) {
    step1State = readyCount >= total ? "done" : pendingCount > 0 ? "active" : "waiting";
    step2State = "waiting";
    step3State = "waiting";
    step4State = "waiting";
  } else {
    if (pendingCount > 0) {
      step1State = "active";
    } else if (readyCount >= total || (isProcessing && autoStage !== null)) {
      step1State = "done";
    } else {
      step1State = "waiting";
    }

    if (isProcessing && autoStage === "export") {
      step2State = "active";
      step3State = "waiting";
      step4State = "waiting";
    } else if (isProcessing && autoStage === "r2") {
      step2State = "done";
      step3State = "active";
      step4State = "waiting";
    } else if (isProcessing && autoStage === "sheet") {
      step2State = "done";
      step3State = "done";
      step4State = "active";
    } else {
      step2State = "waiting";
      step3State = "waiting";
      step4State = "waiting";
    }
  }

  let overallPercent = 0;
  if (isDone) {
    overallPercent = 100;
  } else if (isFailed) {
    if (step4State === "error") overallPercent = 90;
    else if (step3State === "error") overallPercent = 80;
    else if (step2State === "error") overallPercent = 70;
    else if (step1State === "done") overallPercent = 70;
    else overallPercent = Math.min(Math.round((readyCount / Math.max(total, 1)) * 70), 70);
  } else {
    const step1Percent = Math.min(Math.round((readyCount / Math.max(total, 1)) * 70), 70);
    const step2Percent = step2State === "done" ? 10 : step2State === "active" ? 5 : 0;
    const step3Percent = step3State === "done" ? 10 : step3State === "active" ? 5 : 0;
    const step4Percent = step4State === "done" ? 10 : step4State === "active" ? 5 : 0;
    overallPercent = Math.min(step1Percent + step2Percent + step3Percent + step4Percent, 99);
  }

  return {
    step1State,
    step2State,
    step3State,
    step4State,
    overallPercent,
  };
}

interface PipelineProgressProps {
  batch: GenerationBatchDTO;
}

export function PipelineProgress({ batch }: PipelineProgressProps) {
  const autoPublishMutation = useAutoPublishBatch();

  const jobs = batch.jobs ?? [];
  const total = batch.requestedCount || jobs.length || 13;
  const readyCount = jobs.filter((j) => j.status === "completed" && j.images.length > 0).length;
  const pendingCount = jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const problemCount = jobs.filter((j) => j.status === "failed" || j.status === "unknown" || (j.status === "completed" && j.images.length === 0)).length;

  const isDone = batch.autoStatus === "done";
  const isFailed = batch.autoStatus === "failed";
  const isRetrying = batch.autoStatus === "retrying";
  const isSkipped = batch.autoStatus === "skipped";

  const { step1State, step2State, step3State, step4State, overallPercent } = derivePipelineStepStates({
    autoStatus: batch.autoStatus,
    autoStage: batch.autoStage,
    readyCount,
    total,
    pendingCount,
    problemCount,
  });

  // Subtitles
  let step1Subtitle = `Tạo ảnh (${readyCount}/${total})`;
  if (isRetrying) {
    step1Subtitle = "Đang tạo lại ảnh lỗi";
  } else if (step1State === "error") {
    step1Subtitle = problemCount > 0 ? `${problemCount} ảnh bị lỗi` : "Tạo ảnh thất bại";
  } else if (step1State === "done") {
    step1Subtitle = `Đã tạo ${readyCount}/${total} ảnh`;
  } else if (step1State === "active") {
    step1Subtitle = `Đang tạo ảnh (${readyCount}/${total})`;
  }

  const step2Subtitle =
    step2State === "done"
      ? "Đã chuẩn bị xong"
      : step2State === "active"
        ? "Đang chuẩn bị..."
        : step2State === "error"
          ? "Lỗi chuẩn bị file in & mockup"
          : "Chờ tới lượt";

  const step3Subtitle =
    step3State === "done"
      ? "Đã lưu kho dữ liệu"
      : step3State === "active"
        ? "Đang lưu..."
        : step3State === "error"
          ? "Lỗi lưu kho dữ liệu"
          : "Chờ tới lượt";

  const step4Subtitle =
    step4State === "done"
      ? "Hoàn tất"
      : step4State === "active"
        ? "Đang ghi sheet..."
        : step4State === "error"
          ? "Lỗi ghi Google Sheet"
          : "Chờ tới lượt";

  function handleRetry() {
    autoPublishMutation.mutate(batch.id, {
      onSuccess: () => toast.success("Đã bắt đầu chạy lại, tiến trình sẽ tự cập nhật"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Thử lại thất bại"),
    });
  }

  const steps = [
    {
      id: 1,
      title: "1. Tạo ảnh",
      subtitle: step1Subtitle,
      icon: Wand2,
      state: step1State,
    },
    {
      id: 2,
      title: "2. Chuẩn bị file in & mockup",
      subtitle: step2Subtitle,
      icon: Layers,
      state: step2State,
    },
    {
      id: 3,
      title: "3. Lưu lên kho dữ liệu",
      subtitle: step3Subtitle,
      icon: Cloud,
      state: step3State,
    },
    {
      id: 4,
      title: "4. Ghi Google Sheet",
      subtitle: step4Subtitle,
      icon: FileSpreadsheet,
      state: step4State,
    },
  ];

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      {/* Overall Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">
            {isDone
              ? "Quy trình hoàn tất 100%"
              : isSkipped
                ? "Đã dừng quy trình tự động"
                : isFailed
                  ? `Có lỗi ở bước xử lý (${overallPercent}%)`
                  : `Đang xử lý tự động (${overallPercent}%)`}
          </span>
          <span className="font-semibold text-muted-foreground">{overallPercent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isFailed ? "bg-red-500" : isDone ? "bg-emerald-600" : "bg-primary",
            )}
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {/* 4 Steps */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.id}
              className={cn(
                "flex items-start gap-3 rounded-md border p-3 text-xs transition-colors",
                s.state === "done" && "border-emerald-200 bg-emerald-50/50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200",
                s.state === "active" && "border-primary/50 bg-primary/5 text-foreground ring-1 ring-primary/30",
                s.state === "error" && "border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
                s.state === "waiting" && "border-border/60 bg-muted/20 text-muted-foreground",
              )}
            >
              <div className="mt-0.5 shrink-0">
                {s.state === "done" ? (
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : s.state === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : s.state === "error" ? (
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/60" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 font-medium">
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{s.title}</span>
                </div>
                <p className="truncate text-[11px] opacity-80">{s.subtitle}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* State notes / Hints */}
      {pendingCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Mỗi ảnh ~1 phút, bạn có thể làm việc khác. Trang tự cập nhật tiến độ.
        </p>
      )}

      {isSkipped && (
        <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/40 p-2.5 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{batch.autoError || "Bộ không đủ 13 ảnh nên không tự xuất."}</span>
        </div>
      )}

      {isFailed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50/80 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span className="truncate font-medium">
              {batch.autoError ? `Lỗi: ${batch.autoError}` : "Đã xảy ra sự cố trong quá trình tự động."}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-red-300 text-red-900 hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900/40"
            onClick={handleRetry}
            disabled={autoPublishMutation.isPending}
          >
            {autoPublishMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="mr-1 h-3.5 w-3.5" />
            )}
            Thử lại
          </Button>
        </div>
      )}
    </div>
  );
}
