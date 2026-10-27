import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client/api";
import type { SceneDTO } from "@/lib/types";
import type { SceneCreateInput, SceneUpdateInput } from "@/lib/validations/presets";

export function useScenes() {
  return useQuery({
    queryKey: ["scenes"],
    queryFn: () => apiGet<SceneDTO[]>("/api/scenes"),
  });
}

export function useCreateScene() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SceneCreateInput) => apiPost<SceneDTO>("/api/scenes", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scenes"] }),
  });
}

export function useUpdateScene() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SceneUpdateInput }) =>
      apiPut<SceneDTO>(`/api/scenes/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scenes"] }),
  });
}

export function useDeleteScene() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/scenes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scenes"] }),
  });
}
