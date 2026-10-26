import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/client/api";
import type { ConnectionStatusResponse, ConnectionTestResponse } from "@/lib/types";

export function useConnectionStatus() {
  return useQuery({
    queryKey: ["connection", "status"],
    queryFn: () => apiGet<ConnectionStatusResponse>("/api/connection/status"),
  });
}

export function useConnectionTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (baseUrl?: string) =>
      apiPost<ConnectionTestResponse>("/api/connection/test", baseUrl ? { baseUrl } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connection"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export type HeaderConnectionState = "not_configured" | "checking" | "connected" | "disconnected";

/**
 * Drives the header's connection badge: never reports "connected" purely
 * because a URL is saved -- it always requires a live /system_stats check
 * (initial check on mount, then re-checked periodically) against the
 * saved URL.
 */
export function useHeaderConnectionState() {
  const statusQuery = useConnectionStatus();
  const isConfigured = statusQuery.data?.state === "configured_untested";

  const liveQuery = useQuery({
    queryKey: ["connection", "live"],
    queryFn: () => apiPost<ConnectionTestResponse>("/api/connection/test"),
    enabled: isConfigured,
    refetchInterval: isConfigured ? 30_000 : false,
    retry: false,
  });

  let state: HeaderConnectionState = "not_configured";
  if (statusQuery.isLoading) {
    state = "checking";
  } else if (!isConfigured) {
    state = "not_configured";
  } else if (liveQuery.isFetching && !liveQuery.data) {
    state = "checking";
  } else if (liveQuery.data?.state === "connected") {
    state = "connected";
  } else {
    state = "disconnected";
  }

  return { state, detail: liveQuery.data, refetch: liveQuery.refetch };
}
