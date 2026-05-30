import type { Health } from "../api/types";
import { Pill } from "./Pill";

// Sensor / subsystem readiness grid. Reads like an MFD systems page: each
// row is a subsystem, each pill is its bracketed status indicator.
export function HealthPanel({ health }: { health: Health | undefined }) {
  const entries = health ? Object.entries(health) : [];
  if (entries.length === 0) {
    return <em className="text-xs text-[var(--hud-text-dim)]">no health telemetry</em>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between py-0.5">
          <span className="font-mono uppercase tracking-wider text-[var(--hud-text-dim)]">
            {key}
          </span>
          <Pill tone={value ? "ok" : "bad"}>{value ? "ok" : "fail"}</Pill>
        </div>
      ))}
    </div>
  );
}

