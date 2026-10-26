import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/client/api";
import type { GenerationBatchDTO, GenerationJobDTO, HistoryListResponse } from "@/lib/types";

export interface HistoryFilters {
  status?: string;
  styleId?: string;
  search?: string;
  from?: string;
  to?: string;
}

export function useHistoryList(filters: HistoryFilters) {
  return useInfiniteQuery({
    queryKey: ["history", filters],
    queryFn: ({ pageParam }: { pageParam: string | null }) => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.styleId) params.set("styleId", filters.styleId);
      if (filters.search) params.set("search", filters.search);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (pageParam) params.set("cursor", pageParam);
      return apiGet<HistoryListResponse>(`/api/history?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useJobDetail(jobId: string | null) {
  return useQuery({
    queryKey: ["history", "job", jobId],
    queryFn: () => apiGet<GenerationJobDTO>(`/api/history/${jobId}`),
    enabled: Boolean(jobId),
  });
}

export function useRegenerateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, seedMode }: { jobId: string; seedMode: "same" | "random" }) =>
      apiPost<GenerationBatchDTO>(`/api/history/${jobId}/regenerate`, { seedMode }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] }),
  });
}
