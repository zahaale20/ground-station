import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { DroneInfo } from "../api/types";

// Polls /api/info every 10 s. Most fields are static once the autopilot
// connects, but keeping the poll lets the page recover if the backend is
// restarted while the dashboard is open.
export function InfoPanel() {
  const [info, setInfo] = useState<DroneInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get<DroneInfo>("/api/info");
        if (!cancelled) {
          setInfo(data);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return; // handled by auth ctx
        setError(err instanceof Error ? err.message : "failed to load /api/info");
      }
    }
    void load();
    const id = window.setInterval(load, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (error) return <div className="font-mono text-xs uppercase text-[var(--hud-red)]">{error}</div>;
  if (!info) return <div className="font-mono text-xs uppercase text-[var(--hud-text-dim)]">loading…</div>;

  const dash = (value: unknown) =>
    value === null || value === undefined || value === "" ? "—" : String(value);

  const rows: Array<[string, string]> = [
    ["VENDOR", dash(info.vendor)],
    ["PRODUCT", dash(info.product)],
    ["FW", dash(info.flight_sw)],
    ["OS", dash(info.os_sw)],
    ["GIT", dash(info.flight_sw_git)],
    ["UID", dash(info.hardware_uid)],
  ];

  const paramRows = info.params ? Object.entries(info.params) : [];

  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {rows.map(([key, value]) => (
          <div
            key={key}
            className="flex justify-between border-b border-dashed border-[var(--hud-green-dim)]/30 py-1 last:border-none"
          >
            <dt className="font-mono uppercase tracking-wider text-[var(--hud-text-dim)]">
              {key}
            </dt>
            <dd className="font-mono tabular-nums text-[var(--hud-green)]">{value}</dd>
          </div>
        ))}
      </dl>
      {paramRows.length > 0 && (
        <>
          <div className="mt-3.5 mb-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--hud-text-dim)]">
            key parameters
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {paramRows.map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between border-b border-dashed border-[var(--hud-green-dim)]/30 py-1 last:border-none"
              >
                <dt className="font-mono uppercase tracking-wider text-[var(--hud-text-dim)]">
                  {key}
                </dt>
                <dd className="font-mono tabular-nums text-[var(--hud-green)]">
                  {value ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
