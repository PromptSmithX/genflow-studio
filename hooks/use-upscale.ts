import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/client/api";
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
  upscaleResult: {
    total: number;
    done: number;
    failed: number;
    backCover: "done" | "failed" | "skipped";
    finalExport: "done" | "failed" | "skipped";
    mockup: "done" | "failed" | "skipped";
  };
}

export function useUpscaleBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, formatId }: { batchId: string; formatId: string }) =>
      apiPost<UpscaleBatchResponse>(`/api/generations/${batchId}/upscale`, { formatId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["generations", variables.batchId] });
      queryClient.invalidateQueries({ queryKey: ["mockup", variables.batchId] });
    },
  });
}

export interface BatchMockupInfo {
  status: "done" | "failed" | null;
  files: string[];
  // Đổi mỗi lần batch được cập nhật -> dùng làm ?v= để ảnh mockup không bị cache cũ.
  version: number;
}

export function useBatchMockup(batchId: string, enabled = true) {
  return useQuery({
    queryKey: ["mockup", batchId],
    queryFn: () => apiGet<BatchMockupInfo>(`/api/generations/${batchId}/mockup`),
    enabled: Boolean(batchId) && enabled,
  });
}

export function useGenerateMockup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      apiPost<{ status: string; files: string[] }>(`/api/generations/${batchId}/mockup`),
    onSuccess: (_data, batchId) => {
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["generations", batchId] });
      queryClient.invalidateQueries({ queryKey: ["mockup", batchId] });
    },
  });
}

/** Mở Windows Explorer đúng thư mục file in đã xuất của batch (xem app/api/generations/[batchId]/reveal-folder). */
export function useRevealFolder() {
  return useMutation({
    mutationFn: (args: string | { batchId: string; folder?: string }) => {
      const batchId = typeof args === "string" ? args : args.batchId;
      const folder = typeof args === "string" ? undefined : args.folder;
      const query = folder ? `?folder=${encodeURIComponent(folder)}` : "";
      return apiPost<{ ok: true }>(`/api/generations/${batchId}/reveal-folder${query}`);
    },
  });
}
