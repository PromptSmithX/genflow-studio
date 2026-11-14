"use client";

import { toast } from "sonner";
import { FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRevealFolder } from "@/hooks/use-upscale";

/**
 * Chỉ hiện khi batch đã xuất xong file in (finalExportStatus === "done", xem
 * lib/generations/upscale-image.ts::exportBatchFolders). Bấm là mở Windows
 * Explorer đúng thư mục chứa 2 folder không-che/đã-che của batch đó.
 */
export function OpenFolderButton({
  batchId,
  status,
  folder,
  label = "Mở thư mục bộ lịch",
  variant = "outline",
  className,
}: {
  batchId: string;
  status: "done" | "failed" | null;
  /** "results": thư mục kết quả 2 khổ + mockup (cấu trúc như R2). */
  folder?: "results";
  label?: string;
  variant?: "outline" | "default";
  className?: string;
}) {
  const revealMutation = useRevealFolder();

  if (status !== "done") return null;

  return (
    <Button
      variant={variant}
      size="sm"
      className={className}
      disabled={revealMutation.isPending}
      onClick={() =>
        revealMutation.mutate(folder ? { batchId, folder } : batchId, {
          onError: (e) => toast.error(e instanceof Error ? e.message : "Không mở được thư mục"),
        })
      }
    >
      {revealMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
