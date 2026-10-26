"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStyles } from "@/hooks/use-styles";
import type { HistoryFilters } from "@/hooks/use-history";

interface HistoryFiltersBarProps {
  value: HistoryFilters;
  onChange: (next: HistoryFilters) => void;
}

const STATUS_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "queued", label: "Đang chờ" },
  { value: "running", label: "Đang tạo" },
  { value: "completed", label: "Hoàn thành" },
  { value: "failed", label: "Thất bại" },
  { value: "unknown", label: "Không xác định" },
];

export function HistoryFiltersBar({ value, onChange }: HistoryFiltersBarProps) {
  const { data: styles } = useStyles();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Tìm theo ý tưởng/prompt..."
          value={value.search ?? ""}
          onChange={(e) => onChange({ ...value, search: e.target.value || undefined })}
        />
      </div>

      <Select
        value={value.status ?? "all"}
        onValueChange={(v) => {
          if (typeof v === "string") onChange({ ...value, status: v === "all" ? undefined : v });
        }}
      >
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.styleId ?? "all"}
        onValueChange={(v) => {
          if (typeof v === "string") onChange({ ...value, styleId: v === "all" ? undefined : v });
        }}
      >
        <SelectTrigger className="w-48"><SelectValue placeholder="Tất cả style" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả style</SelectItem>
          {(styles ?? []).map((style) => (
            <SelectItem key={style.id} value={style.id}>{style.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        className="w-40"
        value={value.from ?? ""}
        onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
      />
      <Input
        type="date"
        className="w-40"
        value={value.to ?? ""}
        onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
      />
    </div>
  );
}
