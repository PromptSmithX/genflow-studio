"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileSpreadsheet, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HistoryFiltersBar } from "@/components/history/history-filters";
import { HistoryGrid } from "@/components/history/history-grid";
import { useAdvancedMode } from "@/hooks/use-settings";
import { useSheetUrl } from "@/hooks/use-sheets";
import type { HistoryFilters } from "@/hooks/use-history";

function HistoryContent() {
  const [filters, setFilters] = useState<HistoryFilters>({});
  const focusBatchId = useSearchParams().get("batch");
  const advancedMode = useAdvancedMode();

  return (
    <>
      {advancedMode && <HistoryFiltersBar value={filters} onChange={setFilters} />}
      <HistoryGrid filters={filters} focusBatchId={focusBatchId} />
    </>
  );
}

export default function HistoryPage() {
  const sheetUrl = useSheetUrl();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Bộ lịch tự chạy đến khi xong, bạn không cần bấm gì thêm.
        </p>
        <div className="flex items-center gap-2">
          {sheetUrl ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={sheetUrl} target="_blank" rel="noopener noreferrer" />}
            >
              <FileSpreadsheet className="h-4 w-4" /> Mở Google Sheet
            </Button>
          ) : (
            <Button variant="outline" disabled title="Chưa cấu hình Google Sheet">
              <FileSpreadsheet className="h-4 w-4" /> Mở Google Sheet
            </Button>
          )}
          <Button variant="outline" nativeButton={false} render={<Link href="/create" />}>
            <Wand2 /> Tạo bộ lịch mới
          </Button>
        </div>
      </div>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <HistoryContent />
      </Suspense>
    </div>
  );
}
