"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImagePlus, BookText, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/create", label: "Tạo ảnh", icon: ImagePlus },
  { href: "/prompts", label: "Thư viện prompt", icon: BookText },
  { href: "/history", label: "Lịch sử", icon: History },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="h-7 w-7 rounded-lg bg-primary" aria-hidden />
        <span className="font-semibold tracking-tight">Anima Studio</span>
      </div>
      <nav className="flex flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
