"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCalendarFormats, resolveDefaultFormatId, CALENDAR_FORMAT_STORAGE_KEY } from "@/hooks/use-calendar-formats";
import { useUpscaleBatch } from "@/hooks/use-upscale";

/**
 * Xuất file in cho cả batch bằng 1 nút, thay vì bấm từng ảnh. Dùng chung ở mỗi
 * nhóm batch trang Kết quả. Có hộp xác nhận trước khi chạy, vì đây là bước
 * chốt cuối: phóng to + ghép bìa sau + xuất 2 thư mục (không che / đã che).
 */
export function BatchUpscaleButton({ batchId, className }: { batchId: string; className?: string }) {
  const { data: formatsData } = useCalendarFormats();
  const upscaleMutation = useUpscaleBatch();
  const formats = formatsData?.formats ?? [];

  const [formatId, setFormatId] = useState<string>("");
  const [formatDefaulted, setFormatDefaulted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Mặc định khổ lịch một lần khi danh sách tải xong, giống JobDetail: điều
  // chỉnh state khi render để tránh cascading renders trong effect.
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

  function runExport() {
    if (!formatId) return;
    upscaleMutation.mutate(
      { batchId, formatId },
      {
        onSuccess: (data) => {
          const { total, done, failed, backCover, finalExport } = data.upscaleResult;
          if (finalExport === "done") {
            toast.success(`Đã xuất file in cho ${done}/${total} ảnh vào 2 thư mục (không che / đã che)`);
          } else if (failed > 0) {
            toast.error(`Hoàn thiện ${done}/${total} ảnh, ${failed} ảnh lỗi`);
          } else {
            toast.success(`Đã hoàn thiện ${done}/${total} ảnh để in`);
          }
          if (backCover === "failed") toast.error("Tạo bìa sau thất bại");
          if (finalExport === "failed") toast.error("Xuất thư mục file in thất bại");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Hoàn thiện thất bại"),
        onSettled: () => setConfirmOpen(false),
      },
    );
  }

  return (
    <div className={className ? `flex items-center gap-2 ${className}` : "flex items-center gap-2"}>
      <Select value={formatId} onValueChange={(v) => { if (typeof v === "string") handleFormatChange(v); }}>
        <SelectTrigger className="w-56">
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={upscaleMutation.isPending || !formatId}
      >
        {upscaleMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
        {upscaleMutation.isPending ? "Đang hoàn thiện..." : "Hoàn thiện & xuất file in"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn đã xem kỹ 13 ảnh chưa?</AlertDialogTitle>
            <AlertDialogDescription>
              Bấm xác nhận sẽ phóng to toàn bộ ảnh về khổ in, ghép bìa sau và xuất ra 2 thư mục (không che / đã
              che) sẵn sàng đem in. Hãy xem kỹ ảnh bên dưới trước khi tiếp tục.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Để xem thêm</AlertDialogCancel>
            <AlertDialogAction onClick={runExport} disabled={upscaleMutation.isPending}>
              {upscaleMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Xuất file in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
