import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/api";

export interface SheetsStatusResponse {
  configured: boolean;
  missing: string[];
  sheetUrl: string | null;
}

export function useSheetsStatus() {
  return useQuery({
    queryKey: ["sheets", "status"],
    queryFn: () => apiGet<SheetsStatusResponse>("/api/sheets/status"),
  });
}

export function useSheetUrl(): string | null {
  const { data } = useSheetsStatus();
  return data?.sheetUrl ?? null;
}
