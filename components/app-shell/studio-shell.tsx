"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/app-shell/sidebar";
import { ConnectionBadge } from "@/components/app-shell/connection-badge";

const TITLES: Record<string, string> = {
  "/create": "Tạo ảnh",
  "/prompts": "Thư viện prompt",
  "/history": "Lịch sử",
  "/settings": "Cài đặt",
};

function titleFor(pathname: string): string {
  const match = Object.keys(TITLES).find((key) => pathname === key || pathname.startsWith(`${key}/`));
  return match ? TITLES[match] : "Anima Studio";
}

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-muted/30">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-6">
          <h1 className="text-lg font-semibold tracking-tight">{titleFor(pathname ?? "")}</h1>
          <ConnectionBadge />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
