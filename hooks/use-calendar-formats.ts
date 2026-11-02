import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/api";
import type { CalendarFormat } from "@/lib/calendar/formats";

export type { CalendarFormat };

export const CALENDAR_FORMAT_STORAGE_KEY = "anima.calendarFormat";

export function useCalendarFormats() {
  return useQuery({
    queryKey: ["calendar-formats"],
    queryFn: () => apiGet<{ formats: CalendarFormat[] }>("/api/calendar/formats"),
    staleTime: 5 * 60_000,
  });
}

/**
 * Khổ lịch mặc định cho thao tác upscale nhanh: lựa chọn nhớ gần nhất
 * (localStorage) nếu còn hợp lệ, ngược lại lấy khổ lớn nhất (phần tử đầu).
 */
export function resolveDefaultFormatId(formats: CalendarFormat[]): string | null {
  if (formats.length === 0) return null;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(CALENDAR_FORMAT_STORAGE_KEY);
  } catch {
    stored = null;
  }
  return stored && formats.some((f) => f.id === stored) ? stored : formats[0].id;
}
