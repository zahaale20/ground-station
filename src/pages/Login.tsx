import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

// Single-user login screen. Mirrors the credential prompts from the
// previous static HTML page, but talks to /login via fetch so we stay in
// the SPA instead of letting the browser follow the 303 redirect.
export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      // The router observes status === "authed" and unmounts this view.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full place-items-center bg-slate-950 px-4">
      <form
        onSubmit={onSubmit}
        autoComplete="off"
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/80 p-7 shadow-2xl backdrop-blur"
      >
        <h1 className="mb-1 text-lg font-semibold tracking-wide">
          Drone Ground Station
        </h1>
        <p className="mb-5 text-sm text-slate-400">Sign in to continue.</p>

        <label className="mb-1 block text-xs text-slate-400" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />

        <label className="mb-1 block text-xs text-slate-400" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Log in"}
        </button>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-900 bg-rose-950/60 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
