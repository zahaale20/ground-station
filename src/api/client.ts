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
export async function login(username: string, password: string): Promise<void> {
  const form = new URLSearchParams({ username, password });
  const res = await fetch("/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    // Don't follow the 303 redirect the backend sends on success; we route
    // client-side after we see a 2xx/3xx.
    redirect: "manual",
  });
  // "opaqueredirect" means the browser saw a redirect but cannot expose
  // headers — that's actually the success path for the backend's 303.
  if (res.type === "opaqueredirect" || res.ok) return;
  if (res.status === 401) throw new ApiError(401, "Invalid username or password");
  throw new ApiError(res.status, `Login failed: ${res.statusText}`);
}

export async function logout(): Promise<void> {
  await fetch("/logout", { method: "GET", credentials: "include", redirect: "manual" });
}
