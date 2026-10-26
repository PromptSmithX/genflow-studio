"use client";

import { useState } from "react";
import { HistoryFiltersBar } from "@/components/history/history-filters";
import { HistoryGrid } from "@/components/history/history-grid";
import type { HistoryFilters } from "@/hooks/use-history";

export default function HistoryPage() {
  const [filters, setFilters] = useState<HistoryFilters>({});

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <HistoryFiltersBar value={filters} onChange={setFilters} />
      <HistoryGrid filters={filters} />
    </div>
  );
}
