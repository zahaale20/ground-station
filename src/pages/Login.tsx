import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

// Authenticate screen. Styled as a cockpit boot screen so the operator
// "powers on" the GCS rather than logging into a web form.
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
      setError(err instanceof Error ? err.message : "AUTH FAILURE");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full place-items-center px-4">
      <form
        onSubmit={onSubmit}
        autoComplete="off"
        className="hud-frame relative w-full max-w-sm p-7"
      >
        <span className="hud-corner-bl" />
        <span className="hud-corner-br" />
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.35em] text-[var(--hud-text-dim)]">
          stallion // ground station
        </div>
        <h1 className="mb-1 font-mono text-lg font-bold tracking-[0.18em] text-[var(--hud-green)]">
          ◆ AUTHENTICATE
        </h1>
        <p className="mb-5 font-mono text-xs uppercase tracking-widest text-[var(--hud-text-dim)]">
          operator credentials required
        </p>

        <label
          className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-[var(--hud-text-dim)]"
          htmlFor="username"
        >
          callsign
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-3 w-full border border-[var(--hud-green-dim)] bg-black/60 px-3 py-2 font-mono text-sm text-[var(--hud-green)] outline-none focus:border-[var(--hud-green)]"
        />

        <label
          className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-[var(--hud-text-dim)]"
          htmlFor="password"
        >
          access code
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-[var(--hud-green-dim)] bg-black/60 px-3 py-2 font-mono text-sm text-[var(--hud-green)] outline-none focus:border-[var(--hud-green)]"
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full border border-[var(--hud-green)] bg-[var(--hud-green-dim)]/20 px-3 py-2.5 font-mono text-sm font-bold uppercase tracking-[0.3em] text-[var(--hud-green)] transition hover:bg-[var(--hud-green-dim)]/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "linking…" : "▶ engage"}
        </button>

        {error && (
          <div className="mt-4 border border-[var(--hud-red)] bg-black/70 px-3 py-2 font-mono text-xs uppercase tracking-widest text-[var(--hud-red)] hud-blink">
            ◆ {error}
          </div>
        )}
      </form>
    </div>
  );
}

