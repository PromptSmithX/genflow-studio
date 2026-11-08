"use client";

import Link from "next/link";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistoryList, type HistoryFilters } from "@/hooks/use-history";
import { BatchCard } from "@/components/history/batch-card";
import { R2ExportDialog } from "@/components/history/r2-export-dialog";

export function HistoryGrid({ filters, focusBatchId }: { filters: HistoryFilters; focusBatchId: string | null }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useHistoryList(filters);
  const batches = data?.pages.flatMap((page) => page.batches) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Danh sách bộ lịch {batches.length > 0 && `(${batches.length})`}
        </h2>
        <R2ExportDialog />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {filters.search ? "Không tìm thấy bộ lịch nào khớp." : "Chưa có bộ lịch nào."}
          </p>
          {!filters.search && (
            <Button nativeButton={false} render={<Link href="/create" />}>
              <Wand2 /> Tạo bộ lịch đầu tiên
            </Button>
          )}
        </div>
      ) : (
        <>
          {batches.map((batch, i) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              defaultOpen={focusBatchId ? batch.id === focusBatchId : i === 0}
            />
          ))}

          {hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Xem các bộ lịch cũ hơn"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
