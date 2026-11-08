"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { HistoryFilters } from "@/hooks/use-history";

export function HistoryFiltersBar({
  value,
  onChange,
}: {
  value: HistoryFilters;
  onChange: (next: HistoryFilters) => void;
}) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder="Tìm bộ lịch theo ý tưởng..."
        value={value.search ?? ""}
        onChange={(e) => onChange({ ...value, search: e.target.value || undefined })}
      />
    </div>
  );
}
