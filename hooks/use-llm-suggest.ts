import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/client/api";
import type { SuggestPromptsInput, SuggestPromptsResponse } from "@/lib/validations/llm";

export function useSuggestPrompts() {
  return useMutation({
    mutationFn: (input: SuggestPromptsInput) => apiPost<SuggestPromptsResponse>("/api/generations/suggest", input),
  });
}
