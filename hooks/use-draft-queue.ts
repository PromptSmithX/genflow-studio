import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/client/api";
import type { DraftQueueItemDTO, GenerationBatchDTO } from "@/lib/types";
import type { EnqueueDraftInput } from "@/lib/validations/generations";

const QUEUE_KEY = ["draft-queue"];

/** Panel "Hàng đợi" ở trang Tạo; tự cập nhật trong lúc còn bộ đang chạy. */
export function useDraftQueue() {
  return useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => apiGet<{ items: DraftQueueItemDTO[] }>("/api/generations/queue"),
    refetchInterval: (query) => ((query.state.data?.items.length ?? 0) > 0 ? 4_000 : 15_000),
  });
}

function useInvalidateQueue() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    queryClient.invalidateQueries({ queryKey: ["history"] });
  };
}

export function useEnqueueDraft() {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: (input: EnqueueDraftInput) => apiPost<GenerationBatchDTO>("/api/generations/draft", input),
    onSuccess: invalidate,
  });
}

export function useRetryDraft() {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: (batchId: string) => apiPost<{ ok: true }>(`/api/generations/${batchId}/retry-draft`),
    onSuccess: invalidate,
  });
}

export function useCancelDraft() {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: (batchId: string) => apiDelete<{ ok: true }>(`/api/generations/${batchId}`),
    onSuccess: invalidate,
  });
}
