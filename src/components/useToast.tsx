import { useCallback, useEffect, useRef, useState } from "react";

interface ToastMessage {
  text: string;
  error: boolean;
  // Bumped on every new message so identical strings still trigger a re-show.
  key: number;
}

// Tiny inline toast. Returns the rendered element plus a setter the caller
// uses to fire messages. Kept local-state rather than a global store because
// only the Dashboard surfaces these and it keeps the data flow obvious.
export function useToast() {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<number | null>(null);
  const seq = useRef(0);

  const show = useCallback((text: string, error = false) => {
    seq.current += 1;
    setMessage({ text, error, key: seq.current });
  }, []);

  useEffect(() => {
    if (!message) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 4000);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [message]);

  const node = message ? (
    <div
      role="status"
      className={`mt-2 whitespace-pre-wrap border px-3 py-2 font-mono text-[11px] uppercase tracking-widest ${
        message.error
          ? "border-[var(--hud-red)] bg-black/70 text-[var(--hud-red)]"
          : "border-[var(--hud-green)] bg-black/70 text-[var(--hud-green)]"
      }`}
    >
      {message.error ? "◆ " : "▶ "}
      {message.text}
    </div>
  ) : null;

  return { show, node };
}
