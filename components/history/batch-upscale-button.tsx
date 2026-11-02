"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCalendarFormats, resolveDefaultFormatId, CALENDAR_FORMAT_STORAGE_KEY } from "@/hooks/use-calendar-formats";
import { useUpscaleBatch } from "@/hooks/use-upscale";

/**
 * Upscale toàn bộ ảnh của 1 batch bằng 1 nút, thay vì bấm từng ảnh. Dùng chung
 * ở BatchTracker (ngay sau khi tạo từ prompt) và mỗi nhóm batch ở trang Lịch sử.
 */
export function BatchUpscaleButton({ batchId, className }: { batchId: string; className?: string }) {
  const { data: formatsData } = useCalendarFormats();
  const upscaleMutation = useUpscaleBatch();
  const formats = formatsData?.formats ?? [];

  const [formatId, setFormatId] = useState<string>("");
  const [formatDefaulted, setFormatDefaulted] = useState(false);

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

  function handleClick() {
    if (!formatId) return;
    upscaleMutation.mutate(
      { batchId, formatId },
      {
        onSuccess: (data) => {
          const { total, done, failed } = data.upscaleResult;
          if (failed > 0) {
            toast.error(`Hoàn thiện ${done}/${total} ảnh, ${failed} ảnh lỗi`);
          } else {
            toast.success(`Đã hoàn thiện ${done}/${total} ảnh để in`);
          }
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Hoàn thiện thất bại"),
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
      <Button variant="outline" size="sm" onClick={handleClick} disabled={upscaleMutation.isPending || !formatId}>
        {upscaleMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
        {upscaleMutation.isPending ? "Đang hoàn thiện..." : "Hoàn thiện cả batch"}
      </Button>
    </div>
  );
}
