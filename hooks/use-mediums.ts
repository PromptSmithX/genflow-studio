import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client/api";
import type { MediumDTO } from "@/lib/types";
import type { MediumCreateInput, MediumUpdateInput } from "@/lib/validations/mediums";

export function useMediums() {
  return useQuery({
    queryKey: ["mediums"],
    queryFn: () => apiGet<MediumDTO[]>("/api/mediums"),
  });
}

export function useCreateMedium() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MediumCreateInput) => apiPost<MediumDTO>("/api/mediums", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mediums"] }),
  });
}

export function useUpdateMedium() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MediumUpdateInput }) =>
      apiPut<MediumDTO>(`/api/mediums/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mediums"] }),
  });
}

export function useDeleteMedium() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/mediums/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mediums"] }),
  });
}
