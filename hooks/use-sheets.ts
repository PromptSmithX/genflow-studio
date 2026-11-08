import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/api";

export interface SheetsStatusResponse {
  configured: boolean;
  missing: string[];
}

export function useSheetsStatus() {
  return useQuery({
    queryKey: ["sheets", "status"],
    queryFn: () => apiGet<SheetsStatusResponse>("/api/sheets/status"),
  });
}
