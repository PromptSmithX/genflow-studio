"use client";

import { useSyncExternalStore } from "react";

/**
 * Khoá điều hướng toàn app trong lúc một thao tác dài đang chạy ở trang hiện tại
 * (vd Trợ lý AI đang soạn prompt + gửi batch). Rời trang giữa chừng sẽ huỷ
 * component -> callback tạo batch không chạy -> mất ảnh mà người dùng không biết.
 * Sidebar đọc khoá này để vô hiệu các mục điều hướng và giải thích lý do.
 *
 * `reason` = lời giải thích hiển thị cho người dùng; `null` = không khoá.
 */
let lockReason: string | null = null;
const listeners = new Set<() => void>();

export function setNavigationLock(reason: string | null): void {
  if (lockReason === reason) return;
  lockReason = reason;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string | null {
  return lockReason;
}

function getServerSnapshot(): string | null {
  return null;
}

export function useNavigationLock(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
