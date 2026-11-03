"use client";

import type { MouseEvent } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRegenerateFresh } from "@/hooks/use-history";
import { cn } from "@/lib/utils";

/**
 * Nút "Sửa lại" đè lên ảnh ở lưới Kết quả: gọi LLM sinh prompt MỚI (không tái
 * dùng prompt cũ, vốn có thể chứa tag xung đột) đúng vai trò bìa/artwork của
 * job, giữ nguyên seed chung batch. Xem lib/generations/regenerate-fresh.ts.
 * Thường nằm đè lên một <Link>, nên chặn propagation để bấm nút không mở trang
 * chi tiết.
 */
export function RegenerateButton({ jobId, className }: { jobId: string; className?: string }) {
  const regenerateMutation = useRegenerateFresh();

  function handleClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    regenerateMutation.mutate(jobId, {
      onSuccess: () => toast.success("Đang tạo lại ảnh với prompt mới..."),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Sửa lại thất bại"),
    });
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="secondary"
      onClick={handleClick}
      disabled={regenerateMutation.isPending}
      title="Sửa lại — tạo prompt mới"
      className={cn("shadow-sm", className)}
    >
      {regenerateMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
