import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/api";
import type { StyleDTO } from "@/lib/types";

export function useStyles() {
  return useQuery({
    queryKey: ["styles"],
    queryFn: () => apiGet<StyleDTO[]>("/api/styles"),
  });
}
