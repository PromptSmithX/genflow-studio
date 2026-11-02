"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Chỉ hiện khi batch đã có bìa sau ghép xong (backCoverStatus === "done"),
 * xem lib/generations/upscale-image.ts::buildBackCover. Tải trực tiếp qua
 * route GET, không cần mutation vì file đã có sẵn trên đĩa.
 */
export function BackCoverDownloadButton({
  batchId,
  status,
  className,
}: {
  batchId: string;
  status: "done" | "failed" | null;
  className?: string;
}) {
  if (status !== "done") return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      render={
        <a href={`/api/generations/${batchId}/back-cover?download=1`} download>
          <Download className="h-3.5 w-3.5" /> Tải bìa sau
        </a>
      }
    />
  );
}
