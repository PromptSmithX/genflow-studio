"use client";

import { CheckCircle2, CircleSlash, Loader2, XCircle } from "lucide-react";
import { useHeaderConnectionState } from "@/hooks/use-connection";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  not_configured: "Chưa cấu hình",
  checking: "Đang kiểm tra",
  connected: "Đã kết nối",
  disconnected: "Mất kết nối",
};

export function ConnectionBadge() {
  const { state } = useHeaderConnectionState();

  const Icon =
    state === "connected"
      ? CheckCircle2
      : state === "checking"
        ? Loader2
        : state === "disconnected"
          ? XCircle
          : CircleSlash;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        state === "connected" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        state === "disconnected" && "border-red-200 bg-red-50 text-red-700",
        state === "checking" && "border-amber-200 bg-amber-50 text-amber-700",
        state === "not_configured" && "border-border bg-muted text-muted-foreground",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", state === "checking" && "animate-spin")} aria-hidden />
      {LABELS[state]}
    </div>
  );
}
