"use client";

import { useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useRegenerateFresh } from "@/hooks/use-history";

/**
 * "Sửa lại" một ảnh tại chỗ: AI viết mô tả mới đúng vai trò bìa/tháng, giữ
 * gương mặt chung của bộ (xem lib/generations/regenerate-fresh.ts). Thường
 * nằm đè lên <Link> nên chặn propagation. Khi bộ lịch đã xuất file in thì hỏi
 * lại trước, vì thư mục file in + mockup sẽ cần xuất lại.
 */
export function RegenerateButton({
  jobId,
  label,
  exported,
  size = "sm",
  className,
}: {
  jobId: string;
  label: string;
  exported: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  const regenerateMutation = useRegenerateFresh();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function run() {
    regenerateMutation.mutate(jobId, {
      onSuccess: () => toast.success(`Đang tạo lại "${label}" với mô tả mới...`),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Sửa lại thất bại"),
      onSettled: () => setConfirmOpen(false),
    });
  }

  function handleClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (exported) setConfirmOpen(true);
    else run();
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="secondary"
        onClick={handleClick}
        disabled={regenerateMutation.isPending}
        className={className}
      >
        {regenerateMutation.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        Sửa lại
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Sửa lại &quot;{label}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Bộ lịch này đã xuất file in. Sau khi ảnh mới tạo xong, bạn cần bấm &quot;Xuất file in&quot; lại để thư mục
              trên máy và ảnh mockup được cập nhật theo ảnh mới.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Thôi</AlertDialogCancel>
            <AlertDialogAction onClick={run} disabled={regenerateMutation.isPending}>
              {regenerateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Sửa lại ảnh này
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
