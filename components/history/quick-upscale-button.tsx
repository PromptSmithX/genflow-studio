"use client";

import type { MouseEvent } from "react";
import { toast } from "sonner";
import { Check, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCalendarFormats, resolveDefaultFormatId } from "@/hooks/use-calendar-formats";
import { useUpscaleImage } from "@/hooks/use-upscale";
import { cn } from "@/lib/utils";

/**
 * Nút upscale nhanh cho từng ảnh ở lưới kết quả: dùng khổ lịch mặc định
 * (localStorage / khổ lớn nhất). Thường nằm đè lên một <Link>, nên chặn
 * propagation để bấm nút không mở trang chi tiết.
 */
export function QuickUpscaleButton({
  imageId,
  done,
  className,
}: {
  imageId: string;
  done: boolean;
  className?: string;
}) {
  const { data: formatsData } = useCalendarFormats();
  const upscaleMutation = useUpscaleImage();
  const formats = formatsData?.formats ?? [];

  function handleClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const formatId = resolveDefaultFormatId(formats);
    if (!formatId) {
      toast.error("Chưa có template lịch để hoàn thiện");
      return;
    }
    upscaleMutation.mutate(
      { imageId, formatId },
      {
        onSuccess: () => toast.success("Đã hoàn thiện ảnh để in"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Hoàn thiện thất bại"),
      },
    );
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant={done ? "default" : "secondary"}
      onClick={handleClick}
      disabled={upscaleMutation.isPending}
      title={done ? "Đã hoàn thiện — bấm để làm lại" : "Hoàn thiện để in"}
      className={cn("shadow-sm", className)}
    >
      {upscaleMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : done ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Printer className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
