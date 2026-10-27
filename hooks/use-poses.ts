import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client/api";
import type { PoseDTO } from "@/lib/types";
import type { PoseCreateInput, PoseUpdateInput } from "@/lib/validations/presets";

export function usePoses() {
  return useQuery({
    queryKey: ["poses"],
    queryFn: () => apiGet<PoseDTO[]>("/api/poses"),
  });
}

export function useCreatePose() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PoseCreateInput) => apiPost<PoseDTO>("/api/poses", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["poses"] }),
  });
}

export function useUpdatePose() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PoseUpdateInput }) =>
      apiPut<PoseDTO>(`/api/poses/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["poses"] }),
  });
}

export function useDeletePose() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/poses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["poses"] }),
  });
}
