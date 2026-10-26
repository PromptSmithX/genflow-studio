import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/client/api";
import type { GlobalPromptDTO } from "@/lib/types";

export function useGlobalPrompt() {
  return useQuery({
    queryKey: ["global-prompt"],
    queryFn: () => apiGet<GlobalPromptDTO>("/api/prompts/global"),
  });
}

export function useUpdateGlobalPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { positivePrompt: string; negativePrompt: string }) =>
      apiPut<GlobalPromptDTO>("/api/prompts/global", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["global-prompt"] }),
  });
}
