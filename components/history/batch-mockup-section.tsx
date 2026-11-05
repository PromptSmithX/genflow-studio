"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Sparkles, FolderOpen, Loader2, Eye, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBatchMockup, useGenerateMockup, useRevealFolder } from "@/hooks/use-upscale";

interface BatchMockupSectionProps {
  batchId: string;
  finalExportStatus: "done" | "failed" | null;
  mockupStatus: "done" | "failed" | null;
}

const MOCKUP_LABELS: Record<string, string> = {
  "00_mockup_covers.png": "Bìa trước & Bìa sau",
  "01_mockup_q1.png": "Quý 1 (Tháng 1 - 3)",
  "02_mockup_q2.png": "Quý 2 (Tháng 4 - 6)",
  "03_mockup_q3.png": "Quý 3 (Tháng 7 - 9)",
  "04_mockup_q4.png": "Quý 4 (Tháng 10 - 12)",
};

export function BatchMockupSection({
  batchId,
  finalExportStatus,
  mockupStatus,
}: BatchMockupSectionProps) {
  const { data: mockupData, isLoading } = useBatchMockup(
    batchId,
    finalExportStatus === "done",
  );
  const generateMutation = useGenerateMockup();
  const revealMutation = useRevealFolder();

  const [previewFile, setPreviewFile] = useState<string | null>(null);

  // Chỉ hiển thị khi batch đã xuất file in
  if (finalExportStatus !== "done") return null;

  const files = mockupData?.files ?? [];
  const isDone = mockupStatus === "done" || files.length > 0;
  const isPending = generateMutation.isPending;

  function handleGenerate() {
    generateMutation.mutate(batchId, {
      onSuccess: () => {
        toast.success("Đã tạo xong 5 ảnh mockup sản phẩm");
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Tạo mockup thất bại");
      },
    });
  }

  function handleRevealMockup() {
    revealMutation.mutate(
      { batchId, folder: "mockup" },
      {
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Không thể mở thư mục mockup");
        },
      },
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="py-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold tracking-tight">
              Mockup sản phẩm Etsy
            </CardTitle>
            {isDone ? (
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 text-xs">
                Sẵn sàng (5 ảnh)
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                {isPending ? "Đang tạo..." : "Chưa tạo"}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              )}
              {isDone ? "Tạo lại Mockup" : "Tạo Mockup"}
            </Button>

            {isDone && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevealMockup}
                disabled={revealMutation.isPending}
              >
                {revealMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5" />
                )}
                Mở thư mục Mockup
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-1">
        {isLoading && !files.length ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Đang tải thông tin mockup...
          </div>
        ) : files.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {files.map((file) => {
                const label = MOCKUP_LABELS[file] ?? file;
                const imageUrl = `/api/generations/${batchId}/mockup/image?name=${encodeURIComponent(file)}`;

                return (
                  <div
                    key={file}
                    className="group relative cursor-pointer overflow-hidden rounded-md border bg-background transition-all hover:border-primary/50 hover:shadow-sm"
                    onClick={() => setPreviewFile(file)}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-muted">
                      <Image
                        src={imageUrl}
                        alt={label}
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 50vw, 20vw"
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <Eye className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    <div className="p-2 text-center">
                      <p className="truncate text-xs font-medium text-foreground">{label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              💡 Toàn bộ ảnh mockup đã được áp dụng bản đã che (kiểm duyệt an toàn cho sàn Etsy) và lưu tại thư mục{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">mockup/</code> của batch.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-dashed py-5 text-center">
            <p className="text-xs text-muted-foreground">
              Chưa có ảnh mockup. Bạn có thể bấm nút <strong>&quot;Tạo Mockup&quot;</strong> ở trên để tự động ghép 14 ảnh vào 5 mẫu phối cảnh.
            </p>
          </div>
        )}
      </CardContent>

      {/* Modal xem ảnh lớn khi bấm vào thumbnail */}
      <Dialog open={Boolean(previewFile)} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl p-4">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center justify-between text-base">
              <span>{previewFile ? MOCKUP_LABELS[previewFile] ?? previewFile : ""}</span>
              {previewFile && (
                <a
                  href={`/api/generations/${batchId}/mockup/image?name=${encodeURIComponent(previewFile)}`}
                  download={previewFile}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Tải ảnh
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
              <Image
                src={`/api/generations/${batchId}/mockup/image?name=${encodeURIComponent(previewFile)}`}
                alt={previewFile}
                fill
                unoptimized
                className="object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
