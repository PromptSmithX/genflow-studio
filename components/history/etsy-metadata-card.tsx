"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function copyToClipboard(text: string, label: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`Đã copy ${label}`))
    .catch(() => toast.error("Không copy được"));
}

/**
 * Card hiển thị metadata Etsy (title/description/13 tags) của một batch, kèm
 * nút Copy từng phần -- mirror style của card "Positive final" ở job-detail.
 * Chỉ render khi batch có ít nhất 1 trong 3 trường (batch tạo trước khi có
 * tính năng này sẽ không có gì để hiển thị).
 */
export function EtsyMetadataCard({
  title,
  description,
  tagsJson,
}: {
  title: string | null;
  description: string | null;
  tagsJson: string | null;
}) {
  let tags: string[] = [];
  if (tagsJson) {
    try {
      const parsed = JSON.parse(tagsJson);
      if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === "string");
    } catch {
      tags = [];
    }
  }

  if (!title && !description && tags.length === 0) return null;

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-medium">Nội dung đăng Etsy</p>
        <p className="text-xs text-muted-foreground">
          Bấm nút copy cạnh từng phần để dán lên Etsy. Nội dung này cũng có trong file <code>etsy.txt</code> của thư mục.
        </p>
      </div>

      {title && (
        <div className="flex items-start justify-between gap-2 rounded-md border p-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Tiêu đề</p>
            <p>{title}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => copyToClipboard(title, "tiêu đề")}>
            <Copy /> Copy
          </Button>
        </div>
      )}

      {description && (
        <div className="flex items-start justify-between gap-2 rounded-md border p-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Mô tả</p>
            <p className="whitespace-pre-line text-muted-foreground">{description}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => copyToClipboard(description, "mô tả")}>
            <Copy /> Copy
          </Button>
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex items-start justify-between gap-2 rounded-md border p-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Từ khoá (tags) — {tags.length}/13</p>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[11px]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => copyToClipboard(tags.join(", "), "từ khoá")}>
            <Copy /> Copy
          </Button>
        </div>
      )}
    </div>
  );
}
