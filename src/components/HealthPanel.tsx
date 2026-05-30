import type { Health } from "../api/types";
import { Pill } from "./Pill";

export function HealthPanel({ health }: { health: Health | undefined }) {
  const entries = health ? Object.entries(health) : [];
  if (entries.length === 0) {
    return <em className="text-sm text-slate-400">no health data yet</em>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="flex justify-between py-0.5">
          <span className="text-slate-400">{key}</span>
          <Pill tone={value ? "ok" : "bad"}>{value ? "OK" : "NO"}</Pill>
        </div>
      ))}
    </div>
  );
}
