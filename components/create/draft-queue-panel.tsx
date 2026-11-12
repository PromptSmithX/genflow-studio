"use client";

import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Clock, ImageIcon, ListOrdered, Loader2, RotateCcw, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCancelDraft, useDraftQueue, useRetryDraft } from "@/hooks/use-draft-queue";
import { ApiRequestError } from "@/lib/client/api";
import type { DraftQueueItemDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

/**
 * Các bộ lịch đã bấm tạo nhưng chưa xong bước sinh ảnh: chờ AI soạn mô tả,
 * đang soạn, soạn lỗi, hoặc đang tạo ảnh. Bộ xong ảnh tự rời khỏi danh sách.
 */
export function DraftQueuePanel() {
  const { data } = useDraftQueue();
  const items = data?.items ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <ListOrdered className="h-4 w-4" /> Hàng đợi
            {items.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
            )}
          </h3>
          <Link href="/history" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            Xem tất cả kết quả
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Chưa có bộ nào đang chạy. Bộ bạn thêm sẽ hiện ở đây — bạn có thể thêm tiếp hoặc chuyển trang, app vẫn tự
            làm.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {items.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function QueueRow({ item }: { item: DraftQueueItemDTO }) {
  const retryMutation = useRetryDraft();
  const cancelMutation = useCancelDraft();
  const busy = retryMutation.isPending || cancelMutation.isPending;

  function retry() {
    retryMutation.mutate(item.id, {
      onSuccess: () => toast.success("Đã đưa lại vào hàng đợi"),
      onError: (error) => toast.error(errorMessage(error, "Không thử lại được")),
    });
  }

  function cancel() {
    cancelMutation.mutate(item.id, {
      onSuccess: () => toast.success("Đã huỷ bộ lịch khỏi hàng đợi"),
      onError: (error) => toast.error(errorMessage(error, "Không huỷ được")),
    });
  }

  return (
    <li className="flex items-start gap-3 p-3">
      <StateIcon state={item.state} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium" title={item.ideaPrompt}>
          {item.ideaPrompt}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.mediumName ? `${item.mediumName} · ` : ""}
          {new Date(item.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <StateText item={item} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.state === "draft_failed" && (
          <Button size="sm" variant="outline" onClick={retry} disabled={busy}>
            <RotateCcw /> Thử lại
          </Button>
        )}
        {(item.state === "waiting" || item.state === "draft_failed") && (
          <Button size="sm" variant="ghost" onClick={cancel} disabled={busy} aria-label="Huỷ">
            <X /> {item.state === "waiting" ? "Huỷ" : "Xoá"}
          </Button>
        )}
        <Link href={`/history?batch=${item.id}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
          Xem
        </Link>
      </div>
    </li>
  );
}

function StateIcon({ state }: { state: DraftQueueItemDTO["state"] }) {
  const className = "mt-0.5 h-4 w-4 shrink-0";
  if (state === "drafting") return <Loader2 className={cn(className, "animate-spin text-primary")} />;
  if (state === "generating") return <ImageIcon className={cn(className, "text-primary")} />;
  if (state === "draft_failed") return <AlertTriangle className={cn(className, "text-red-600")} />;
  return <Clock className={cn(className, "text-muted-foreground")} />;
}

function StateText({ item }: { item: DraftQueueItemDTO }) {
  if (item.state === "waiting") {
    return (
      <p className="text-xs text-muted-foreground">
        Chờ tới lượt{item.queuePosition ? ` · thứ ${item.queuePosition}` : ""}
      </p>
    );
  }
  if (item.state === "drafting") {
    return <p className="text-xs text-primary">AI đang soạn mô tả… (thường 1–2 phút)</p>;
  }
  if (item.state === "draft_failed") {
    return (
      <p className="line-clamp-2 text-xs text-red-700 dark:text-red-400" title={item.draftError ?? undefined}>
        Lỗi soạn mô tả: {item.draftError}
      </p>
    );
  }
  const percent = Math.round((item.readyCount / Math.max(item.totalCount, 1)) * 100);
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Đang tạo ảnh {item.readyCount}/{item.totalCount}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
