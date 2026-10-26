/**
 * Validates a user-supplied ComfyUI base URL. Only http(s) is accepted and
 * the result is always the admin-configured, saved value used for
 * server-side fetches -- never an unrestricted per-request target -- to
 * reduce SSRF risk on this local-only app.
 */
export function parseComfyBaseUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return { ok: false, error: "URL không được để trống" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "URL không hợp lệ" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "URL phải dùng http hoặc https" };
  }

  if (!parsed.hostname) {
    return { ok: false, error: "URL không hợp lệ" };
  }

  return { ok: true, url: trimmed };
}
