import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, ApiError, login as apiLogin, logout as apiLogout, setUnauthorizedHandler } from "../api/client";

// Authentication model: the drone backend issues a session cookie when
// /login succeeds. We keep "authed" as a soft flag in React; the cookie is
// the real source of truth, so on first mount we probe a cheap endpoint
// (/api/info) and trust the result.

interface AuthState {
  status: "unknown" | "authed" | "anonymous";
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  markUnauthorized: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("unknown");

  const markUnauthorized = useCallback(() => setStatus("anonymous"), []);

  useEffect(() => {
    // Wire the API client so any 401 funnels back through here.
    setUnauthorizedHandler(markUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [markUnauthorized]);

  useEffect(() => {
    // Probe once on mount. /api/info is cheap and exists on the backend.
    let cancelled = false;
    (async () => {
      try {
        await api.get("/api/info");
        if (!cancelled) setStatus("authed");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setStatus("anonymous");
        } else {
          // Network errors don't necessarily mean unauthenticated; assume the
          // user might still have a valid cookie and let the UI surface the
          // backend-unreachable state instead.
          setStatus("anonymous");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      markUnauthorized,
      async login(username, password) {
        await apiLogin(username, password);
        setStatus("authed");
      },
      async logout() {
        try {
          await apiLogout();
        } finally {
          setStatus("anonymous");
        }
      },
    }),
    [status, markUnauthorized],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
