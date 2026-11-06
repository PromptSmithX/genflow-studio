"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Sparkles, FolderOpen, Loader2, Download, AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBatchMockup, useGenerateMockup, useRevealFolder } from "@/hooks/use-upscale";

const MOCKUP_LABELS: Record<string, string> = {
  "00_mockup_covers.png": "Bìa trước & bìa sau",
  "01_mockup_q1.png": "Tháng 1 – 3",
  "02_mockup_q2.png": "Tháng 4 – 6",
  "03_mockup_q3.png": "Tháng 7 – 9",
  "04_mockup_q4.png": "Tháng 10 – 12",
};

/** 5 ảnh mockup sản phẩm, đọc đúng từ thư mục `mockup/` của bộ lịch đã xuất. */
export function BatchMockupSection({
  batchId,
  mockupStatus,
}: {
  batchId: string;
  mockupStatus: "done" | "failed" | null;
}) {
  const { data: mockupData, isLoading } = useBatchMockup(batchId);
  const generateMutation = useGenerateMockup();
  const revealMutation = useRevealFolder();
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  const files = mockupData?.files ?? [];
  const version = mockupData?.version ?? 0;
  const isDone = files.length > 0;
  const isPending = generateMutation.isPending;
  const imageUrl = (file: string) =>
    `/api/generations/${batchId}/mockup/image?name=${encodeURIComponent(file)}&v=${version}`;

  function handleGenerate() {
    generateMutation.mutate(batchId, {
      onSuccess: () => toast.success("Đã tạo xong 5 ảnh mockup"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Tạo mockup thất bại"),
    });
  }

  function handleRevealMockup() {
    revealMutation.mutate(
      { batchId, folder: "mockup" },
      { onError: (err) => toast.error(err instanceof Error ? err.message : "Không mở được thư mục mockup") },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Ảnh mockup sản phẩm</p>
          <p className="text-xs text-muted-foreground">
            5 ảnh phối cảnh dùng bản đã che, an toàn để đăng Etsy. Lưu trong thư mục <code>mockup</code>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {isPending ? "Đang tạo mockup..." : isDone ? "Tạo lại mockup" : "Tạo mockup"}
          </Button>
          {isDone && (
            <Button variant="outline" size="sm" onClick={handleRevealMockup} disabled={revealMutation.isPending}>
              {revealMutation.isPending ? <Loader2 className="animate-spin" /> : <FolderOpen />}
              Mở thư mục mockup
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải mockup...
        </div>
      ) : isDone ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {files.map((file) => {
            const label = MOCKUP_LABELS[file] ?? file;
            return (
              <button
                key={file}
                type="button"
                className="group overflow-hidden rounded-md border bg-background text-left transition-all hover:border-primary/50 hover:shadow-sm"
                onClick={() => setPreviewFile(file)}
              >
                <div className="relative aspect-square w-full overflow-hidden bg-muted">
                  <Image
                    src={imageUrl(file)}
                    alt={label}
                    fill
                    unoptimized
                    className="object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </div>
                <p className="truncate p-2 text-center text-xs font-medium">{label}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
          {mockupStatus === "failed" ? (
            <>
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
              Lần tạo mockup trước bị lỗi. Bấm &quot;Tạo mockup&quot; để thử lại.
            </>
          ) : (
            <>Chưa có ảnh mockup. Bấm &quot;Tạo mockup&quot; để ghép 14 trang lịch vào 5 ảnh phối cảnh.</>
          )}
        </div>
      )}

      <Dialog open={Boolean(previewFile)} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl p-4">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center justify-between gap-3 pr-8 text-base">
              <span>{previewFile ? MOCKUP_LABELS[previewFile] ?? previewFile : ""}</span>
              {previewFile && (
                <a
                  href={imageUrl(previewFile)}
                  download={previewFile}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Download className="h-3.5 w-3.5" /> Tải ảnh
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
              <Image src={imageUrl(previewFile)} alt={previewFile} fill unoptimized className="object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
