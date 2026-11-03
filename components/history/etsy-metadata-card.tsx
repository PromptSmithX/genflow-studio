"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card>
      <CardContent className="space-y-3 p-4 text-sm">
        <p className="font-medium">Metadata Etsy</p>

        {title && (
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Title</p>
              <p>{title}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => copyToClipboard(title, "title")}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {description && (
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Description</p>
              <p className="whitespace-pre-line text-muted-foreground">{description}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => copyToClipboard(description, "description")}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Tags ({tags.length}/13)</p>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => copyToClipboard(tags.join(", "), "tags")}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
