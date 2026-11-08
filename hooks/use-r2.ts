import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/client/api";

export interface R2StatusResponse {
  configured: boolean;
  missing: string[];
  connection?: "ok" | "error";
  error?: string;
}

export interface R2CandidateItem {
  id: string;
  etsyTitle: string | null;
  createdAt: string;
  coverImageId: string | null;
  eligible: boolean;
  reason?: string;
  r2SkuBase: string | null;
  r2Status: "done" | "failed" | null;
  r2PushedAt: string | null;
  r2Error: string | null;
}

export interface PushR2Response {
  csvFileName: string | null;
  results: Array<{
    batchId: string;
    ok: boolean;
    skuBase?: string;
    error?: string;
  }>;
}

export function useR2Status() {
  return useQuery({
    queryKey: ["r2", "status"],
    queryFn: () => apiGet<R2StatusResponse>("/api/r2/status"),
  });
}

export function useR2Test() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiGet<R2StatusResponse>("/api/r2/status?test=1"),
    onSuccess: (data) => {
      queryClient.setQueryData(["r2", "status"], data);
    },
  });
}

export function useR2Candidates(enabled = true) {
  return useQuery({
    queryKey: ["r2", "candidates"],
    queryFn: () => apiGet<R2CandidateItem[]>("/api/r2/candidates"),
    enabled,
  });
}

export function usePushR2() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchIds: string[]) =>
      apiPost<PushR2Response>("/api/r2/push", { batchIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["r2", "candidates"] });
    },
  });
}
