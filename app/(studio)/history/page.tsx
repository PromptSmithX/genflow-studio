"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HistoryFiltersBar } from "@/components/history/history-filters";
import { HistoryGrid } from "@/components/history/history-grid";
import type { HistoryFilters } from "@/hooks/use-history";

function HistoryContent() {
  const [filters, setFilters] = useState<HistoryFilters>({});
  const focusBatchId = useSearchParams().get("batch");

  return (
    <>
      <HistoryFiltersBar value={filters} onChange={setFilters} />
      <HistoryGrid filters={filters} focusBatchId={focusBatchId} />
    </>
  );
}

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Mỗi thẻ là một bộ lịch. Làm lần lượt theo các bước: chờ tạo ảnh → kiểm tra & sửa → xuất file in → lấy
          mockup & nội dung Etsy.
        </p>
        <Button variant="outline" nativeButton={false} render={<Link href="/create" />}>
          <Wand2 /> Tạo bộ lịch mới
        </Button>
      </div>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <HistoryContent />
      </Suspense>
    </div>
  );
}
