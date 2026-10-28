import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client/api";
import type { WorkflowSummaryResponse, MappingValidationResponse } from "@/lib/types";
import type { NodeMapping } from "@/lib/comfyui/workflow-mapper";

export function useWorkflow() {
  return useQuery({
    queryKey: ["workflow"],
    queryFn: () => apiGet<WorkflowSummaryResponse>("/api/workflow"),
  });
}

export function useImportWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/workflow/import", { method: "POST", body: formData });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.error?.message ?? "Import workflow thất bại");
      }
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow"] }),
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<{ ok: true }>("/api/workflow"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow"] }),
  });
}

export function useSaveMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mapping: NodeMapping) => apiPut<{ mapping: NodeMapping }>("/api/workflow/mapping", mapping),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow"] }),
  });
}

export function useValidateMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mapping?: NodeMapping) =>
      apiPost<MappingValidationResponse>("/api/workflow/validate", mapping),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflow"] }),
  });
}
