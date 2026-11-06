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
export function BatchUpscaleButton({
  batchId,
  imageCount,
  isReExport,
  className,
}: {
  batchId: string;
  imageCount: number;
  isReExport: boolean;
  className?: string;
}) {
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
          const { total, done, failed, backCover, finalExport, mockup } = data.upscaleResult;
          if (finalExport === "done") {
            toast.success(
              mockup === "done"
                ? `Đã xuất ${done} ảnh vào thư mục trên máy và tạo 5 ảnh mockup`
                : `Đã xuất ${done} ảnh vào thư mục trên máy (bản gốc và bản đã che)`,
            );
          } else if (failed > 0) {
            toast.error(`Xuất được ${done}/${total} ảnh, ${failed} ảnh lỗi`);
          }
          if (backCover === "failed") toast.error("Không ghép được bìa sau");
          if (finalExport === "failed") toast.error("Không ghi được thư mục file in");
          if (mockup === "failed") toast.error("Tạo mockup thất bại — bạn có thể bấm \"Tạo lại mockup\"");
          if (finalExport === "done" && mockup === "skipped") {
            toast.warning("Chưa tạo mockup: mockup cần đủ bìa trước + 12 tháng (13 ảnh)");
          }
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Hoàn thiện thất bại"),
        onSettled: () => setConfirmOpen(false),
      },
    );
  }

  return (
    <div className={className ? `flex flex-wrap items-center gap-2 ${className}` : "flex flex-wrap items-center gap-2"}>
      <Select value={formatId} onValueChange={(v) => { if (typeof v === "string") handleFormatChange(v); }}>
        <SelectTrigger className="w-60" aria-label="Khổ lịch">
          <SelectValue placeholder={formats.length ? "Chọn khổ lịch" : "Không có khổ lịch nào"} />
        </SelectTrigger>
        <SelectContent>
          {formats.map((format) => (
            <SelectItem key={format.id} value={format.id}>
              {format.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={() => setConfirmOpen(true)} disabled={upscaleMutation.isPending || !formatId}>
        {upscaleMutation.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
        {upscaleMutation.isPending ? "Đang xuất... (có thể mất vài phút)" : isReExport ? "Xuất lại file in" : "Xuất file in"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn đã xem kỹ {imageCount} ảnh chưa?</AlertDialogTitle>
            <AlertDialogDescription>
              App sẽ phóng to ảnh về đúng khổ in, tự ghép bìa sau, rồi lưu vào thư mục trên máy gồm: bản gốc
              (khong-che), bản đã che (da-che), 5 ảnh mockup và file etsy.txt.
              {isReExport ? " Thư mục cũ của bộ lịch này sẽ được thay bằng bản mới." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Để xem thêm</AlertDialogCancel>
            <AlertDialogAction onClick={runExport} disabled={upscaleMutation.isPending}>
              {upscaleMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isReExport ? "Xuất lại" : "Xuất file in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
