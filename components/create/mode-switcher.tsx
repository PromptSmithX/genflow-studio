"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const MODES = [
  { href: "/create", label: "Tạo nhanh" },
  { href: "/create/assistant", label: "Trợ lý AI" },
  { href: "/create/advanced", label: "Nâng cao" },
];

export function ModeSwitcher() {
  const pathname = usePathname();

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
      {MODES.map((mode) => (
        <Link
          key={mode.href}
          href={mode.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            pathname === mode.href
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {mode.label}
        </Link>
      ))}
    </div>
  );
}
