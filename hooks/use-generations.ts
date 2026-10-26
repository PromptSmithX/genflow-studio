import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/client/api";
import type { GenerationBatchDTO } from "@/lib/types";
import type { CreateGenerationInput } from "@/lib/validations/generations";

export function useCreateGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGenerationInput) => apiPost<GenerationBatchDTO>("/api/generations", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] }),
  });
}

function isBatchSettled(batch: GenerationBatchDTO | undefined) {
  if (!batch) return false;
  return batch.jobs.every((job) => job.status === "completed" || job.status === "failed" || job.status === "unknown");
}

/**
 * Polls by calling the sync endpoint itself (not a plain GET), so each
 * tick both reads and reconciles real ComfyUI state -- this is also how
 * the batch panel picks back up after a reload or app restart, since the
 * first tick runs immediately.
 */
export function useBatch(batchId: string | null) {
  return useQuery({
    queryKey: ["generations", batchId],
    queryFn: () => apiPost<GenerationBatchDTO>(`/api/generations/${batchId}/sync`),
    enabled: Boolean(batchId),
    refetchInterval: (query) => (isBatchSettled(query.state.data) ? false : 2500),
  });
}

export function useManualSync(batchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<GenerationBatchDTO>(`/api/generations/${batchId}/sync`),
    onSuccess: (data) => {
      queryClient.setQueryData(["generations", batchId], data);
    },
  });
}
