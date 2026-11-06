"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RegenerateButton } from "@/components/history/regenerate-button";
import { useJobDetail } from "@/hooks/use-history";
import { slotLabel } from "@/lib/calendar/slot-label";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  queued: "Đang chờ tới lượt",
  running: "Đang tạo",
  completed: "Đã tạo xong",
  failed: "Bị lỗi",
  unknown: "Không rõ trạng thái",
};

const MASK_STATUS_LABEL: Record<string, string> = {
  censored: "Đã che vùng nhạy cảm",
  clean: "Ảnh sạch, không cần che",
  failed: "Lỗi khi che ảnh",
  skipped: "Chưa bật che ảnh",
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
  const [variant, setVariant] = useState<Variant>("original");

  if (isLoading || !job) {
    return <Skeleton className="h-96 w-full" />;
  }

  const label = slotLabel(job.indexInBatch);
  const image = job.images[0];
  const exported = job.batch.finalExportStatus === "done";
  const pending = job.status === "queued" || job.status === "running";

  const variantOptions: { key: Variant; label: string; hint: string; available: boolean }[] = [
    { key: "original", label: "Bản gốc", hint: "Ảnh vừa tạo, chưa che", available: true },
    { key: "masked", label: "Bản đã che", hint: "Đã che vùng nhạy cảm, dùng để đăng bán", available: Boolean(image?.maskedRelativePath) },
    { key: "upscaled", label: "Bản in (gốc)", hint: "Đã phóng to đúng khổ in — có sau khi xuất file in", available: Boolean(image?.upscaledRelativePath) },
    { key: "upscaled-masked", label: "Bản in (đã che)", hint: "Bản in đã che — có sau khi xuất file in", available: Boolean(image?.upscaledMaskedRelativePath) },
  ];

  const current = variantOptions.find((o) => o.key === variant);
  const active = current?.available ? current : variantOptions[0];
  const variantQuery = active.key === "original" ? "" : `?variant=${active.key}`;
  // Bản in bị ghi đè mỗi lần xuất lại; batch.updatedAt đổi theo nên dùng làm khoá cache.
  const version = new Date(job.batch.updatedAt).getTime();
  const imageSrc = image ? `/api/images/${image.id}${variantQuery}${variantQuery ? "&" : "?"}v=${version}` : null;
  const downloadHref = image ? `/api/images/${image.id}/download${variantQuery}` : null;
  const aspectRatio = job.width && job.height ? `${job.width} / ${job.height}` : "1152 / 952";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            href={`/history?batch=${job.batchId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Về bộ lịch
          </Link>
          <h2 className="text-lg font-semibold">{label}</h2>
          <p className="line-clamp-1 text-sm text-muted-foreground">{job.batch.ideaPrompt}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{STATUS_LABEL[job.status]}</Badge>
          {!pending && <RegenerateButton jobId={job.id} label={label} exported={exported} size="default" />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-3">
          {imageSrc ? (
            <div className="relative w-full overflow-hidden rounded-md border bg-muted" style={{ aspectRatio }}>
              <Image src={imageSrc} alt={label} fill unoptimized className="object-contain" />
            </div>
          ) : (
            <div
              className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
              style={{ aspectRatio }}
            >
              {pending ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" /> {STATUS_LABEL[job.status]}... trang tự cập nhật.
                </>
              ) : (
                <>
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                  <span>Ảnh này bị lỗi. Bấm &quot;Sửa lại&quot; để AI viết mô tả mới và tạo lại.</span>
                </>
              )}
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
                    title={option.available ? option.hint : "Chưa có — bản in có sau khi bấm Xuất file in"}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      active.key === option.key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {downloadHref && (
                <Button variant="outline" nativeButton={false} render={<a href={downloadHref} download />}>
                  <Download /> Tải {active.label.toLowerCase()}
                </Button>
              )}
            </div>
          )}
          {image && <p className="text-xs text-muted-foreground">{active.hint}.</p>}
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              {image?.maskStatus && (
                <p>
                  <span className="text-muted-foreground">Che ảnh: </span>
                  {MASK_STATUS_LABEL[image.maskStatus] ?? image.maskStatus}
                </p>
              )}
              <p className="text-muted-foreground">
                {image?.upscaleStatus === "done"
                  ? `Đã có bản in ${image.upscaledWidth}×${image.upscaledHeight}px.`
                  : "Ảnh sẽ được phóng to đúng khổ in khi bạn bấm \"Xuất file in\" ở bộ lịch."}
              </p>
              {exported && (
                <p className="text-amber-700 dark:text-amber-400">
                  Bộ lịch đã xuất file in. Nếu sửa lại ảnh này, nhớ bấm &quot;Xuất lại file in&quot; ở bộ lịch.
                </p>
              )}
              {job.errorMessage && (
                <p className="text-red-700 dark:text-red-400">Lỗi: {job.errorMessage}</p>
              )}
            </CardContent>
          </Card>

          <Accordion>
            <AccordionItem value="technical">
              <AccordionTrigger>Thông tin kỹ thuật (không cần xem)</AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2 text-sm">
                <PromptRow title="Mô tả gửi cho máy tạo ảnh" text={job.positiveFinal} copyLabel="mô tả" />
                <PromptRow title="Những thứ cần tránh" text={job.negativeFinal} copyLabel="phần cần tránh" />
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Seed" value={job.seed ?? "—"} />
                  <Info label="Kích thước" value={`${job.width ?? "—"}×${job.height ?? "—"}`} />
                  <Info label="Steps" value={job.steps ?? "—"} />
                  <Info label="CFG" value={job.cfg ?? "—"} />
                  <Info label="Bắt đầu" value={job.startedAt ? new Date(job.startedAt).toLocaleString("vi-VN") : "—"} />
                  <Info label="Kết thúc" value={job.finishedAt ? new Date(job.finishedAt).toLocaleString("vi-VN") : "—"} />
                  <div className="col-span-2">
                    <Info label="ComfyUI prompt ID" value={job.promptId ?? "—"} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}

function PromptRow({ title, text, copyLabel }: { title: string; text: string; copyLabel: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="break-words text-muted-foreground">{text || "—"}</p>
      </div>
      {text && (
        <Button variant="ghost" size="icon-sm" onClick={() => copyToClipboard(text, copyLabel)} title="Copy">
          <Copy className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="truncate">{value}</p>
    </div>
  );
}
