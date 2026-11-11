"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImagePlus, History, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigationLock } from "@/lib/client/navigation-lock";

// "Cài đặt" cố ý KHÔNG có trong menu (bàn giao cho người dùng cuối, key đã nhúng
// sẵn). Route /settings vẫn tồn tại cho người cài đặt khi cần sửa cấu hình.
const NAV_ITEMS = [
  { href: "/create", label: "Tạo ảnh", icon: ImagePlus },
  { href: "/history", label: "Kết quả", icon: History },
];

export function Sidebar() {
  const pathname = usePathname();
  const lockReason = useNavigationLock();

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
          const className = cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          );

          // Đang có thao tác dài ở trang hiện tại -> không cho rời trang (mất ảnh).
          if (lockReason && !active) {
            return (
              <span
                key={item.href}
                role="link"
                aria-disabled="true"
                title={lockReason}
                className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground opacity-50"
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </span>
            );
          }

          return (
            <Link key={item.href} href={item.href} className={className}>
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {lockReason && (
        <div
          role="status"
          className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
        >
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          <span>{lockReason}</span>
        </div>
      )}
    </aside>
  );
}
