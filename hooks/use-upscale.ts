import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/client/api";
import type { GeneratedImageDTO, GenerationBatchDTO } from "@/lib/types";

export function useUpscaleImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId, formatId }: { imageId: string; formatId: string }) =>
      apiPost<GeneratedImageDTO>(`/api/images/${imageId}/upscale`, { formatId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] }),
  });
}

export interface UpscaleBatchResponse extends GenerationBatchDTO {
  upscaleResult: { total: number; done: number; failed: number; backCover: "done" | "failed" | "skipped" };
}

export function useUpscaleBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, formatId }: { batchId: string; formatId: string }) =>
      apiPost<UpscaleBatchResponse>(`/api/generations/${batchId}/upscale`, { formatId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["generations", variables.batchId] });
    },
  });
}
