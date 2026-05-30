// Thin wrapper around fetch that:
//   - always sends cookies (drone backend sets a session cookie via /login)
//   - throws a typed ApiError on non-2xx so callers can show toasts cleanly
//   - exposes a 401 hook so the auth context can route the user back to /login

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail || `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(path, init);
  if (res.status === 401) {
    if (onUnauthorized) onUnauthorized();
    throw new ApiError(401, "unauthorized");
  }
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // Backend returned non-JSON; treat the body text as the detail.
      if (!res.ok) throw new ApiError(res.status, text);
    }
  }
  if (!res.ok) {
    const detail =
      (json && typeof json === "object" && "detail" in json
        ? String((json as { detail: unknown }).detail)
        : null) ?? res.statusText;
    throw new ApiError(res.status, detail);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
};

// Login uses x-www-form-urlencoded to match the backend's Form(...) handler.
// The drone API is JSON-only and returns 200 {ok: true} on success or 401
// {error: "invalid_credentials"} on failure -- no HTML, no redirects.
export async function login(username: string, password: string): Promise<void> {
  const form = new URLSearchParams({ username, password });
  const res = await fetch("/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (res.ok) return;
  if (res.status === 401) throw new ApiError(401, "Invalid username or password");
  throw new ApiError(res.status, `Login failed: ${res.statusText}`);
}

export async function logout(): Promise<void> {
  await fetch("/logout", { method: "POST", credentials: "include" });
}
