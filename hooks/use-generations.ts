import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export function useManualSync(batchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<GenerationBatchDTO>(`/api/generations/${batchId}/sync`),
    onSuccess: (data) => {
      queryClient.setQueryData(["generations", batchId], data);
    },
  });
}
