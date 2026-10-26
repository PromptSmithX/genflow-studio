export class ApiRequestError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function parseErrorBody(response: Response): Promise<{ code: string; message: string; details?: unknown }> {
  try {
    const json = await response.json();
    if (json?.error) return json.error;
    return { code: "unknown", message: "Đã xảy ra lỗi không xác định" };
  } catch {
    return { code: "unknown", message: `Lỗi HTTP ${response.status}` };
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new ApiRequestError(error.message, error.code, response.status, error.details);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiGet<T>(path: string) {
  return apiFetch<T>(path);
}

export function apiPost<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiPut<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string) {
  return apiFetch<T>(path, { method: "DELETE" });
}
