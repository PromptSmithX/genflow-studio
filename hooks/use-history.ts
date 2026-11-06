import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/client/api";
import type { GenerationBatchDTO, HistoryListResponse, JobDetailDTO } from "@/lib/types";

export interface HistoryFilters {
  search?: string;
}

function hasUnsettledJob(pages: HistoryListResponse[] | undefined): boolean {
  if (!pages) return false;
  return pages.some((page) =>
    page.batches.some((batch) => batch.jobs.some((job) => job.status === "queued" || job.status === "running")),
  );
}

export function useHistoryList(filters: HistoryFilters) {
  return useInfiniteQuery({
    queryKey: ["history", filters],
    queryFn: ({ pageParam }: { pageParam: string | null }) => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (pageParam) params.set("cursor", pageParam);
      return apiGet<HistoryListResponse>(`/api/history?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // Trong lúc còn job chưa xong, tự refetch để grid hiện ảnh mà poller nền
    // vừa tải về mà người dùng không phải bấm "Đồng bộ lại".
    refetchInterval: (query) => (hasUnsettledJob(query.state.data?.pages) ? 8_000 : false),
  });
}

export function useJobDetail(jobId: string | null) {
  return useQuery({
    queryKey: ["history", "job", jobId],
    queryFn: () => apiGet<JobDetailDTO>(`/api/history/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 8_000 : false;
    },
  });
}

/**
 * "Sửa lại" một ảnh TẠI CHỖ: LLM sinh prompt mới đúng vai trò (bìa/artwork),
 * giữ seed chung batch. Xem app/api/history/[jobId]/regenerate-fresh/route.ts.
 */
export function useRegenerateFresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiPost<GenerationBatchDTO>(`/api/history/${jobId}/regenerate-fresh`),
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["mockup", batch.id] });
    },
  });
}

export function useResyncBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => apiPost<GenerationBatchDTO>(`/api/generations/${batchId}/sync`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] }),
  });
}
