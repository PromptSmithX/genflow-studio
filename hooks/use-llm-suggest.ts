import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/client/api";
import type { SuggestPromptsInput, LlmSuggestionResult } from "@/lib/validations/llm";

export function useSuggestPrompts() {
  return useMutation({
    mutationFn: (input: SuggestPromptsInput) => apiPost<LlmSuggestionResult>("/api/generations/suggest", input),
  });
}
