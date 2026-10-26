import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client/api";
import type { StyleDTO } from "@/lib/types";
import type { StyleCreateInput, StyleUpdateInput } from "@/lib/validations/styles";

export function useStyles() {
  return useQuery({
    queryKey: ["styles"],
    queryFn: () => apiGet<StyleDTO[]>("/api/styles"),
  });
}

export function useCreateStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StyleCreateInput) => apiPost<StyleDTO>("/api/styles", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["styles"] }),
  });
}

export function useUpdateStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: StyleUpdateInput }) =>
      apiPut<StyleDTO>(`/api/styles/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["styles"] }),
  });
}

export function useDeleteStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/styles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["styles"] }),
  });
}
