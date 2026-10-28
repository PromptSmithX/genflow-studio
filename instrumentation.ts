export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoSyncPoller } = await import("@/lib/comfyui/auto-sync");
    startAutoSyncPoller();
  }
}
