import type { Telemetry } from "../api/types";

function fmt(value: number | undefined | null, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "----";
  return value.toFixed(digits);
}

// Tactical telemetry grid: monospaced, all-caps keys, phosphor values.
// Reads as an MFD systems page rather than a settings dialog.
export function FlightStatePanel({ telemetry }: { telemetry: Telemetry | null }) {
  const t = telemetry;
  const batteryPct =
    t && t.battery_pct >= 0 && t.battery_pct <= 100 ? `${fmt(t.battery_pct, 0)}%` : "--";
  const updated = t?.last_update
    ? new Date(t.last_update * 1000).toLocaleTimeString()
    : "----";

  const rows: Array<[string, string]> = [
    ["MODE", t?.flight_mode ?? "----"],
    ["LANDED", t?.landed_state ?? "----"],
    ["BTRY", `${fmt(t?.battery_v)} V  (${batteryPct})`],
    ["GPS", `${t?.gps_fix ?? "----"} · ${t?.gps_sats ?? 0} SV`],
    ["LAT", fmt(t?.lat, 7)],
    ["LON", fmt(t?.lon, 7)],
    ["ALT AGL", `${fmt(t?.rel_alt_m)} m`],
    ["ALT MSL", `${fmt(t?.abs_alt_m)} m`],
    ["GND SPD", `${fmt(t?.ground_speed_mps)} m/s`],
    ["HDG", `${fmt(t?.heading_deg, 1)}°`],
    ["R/P/Y", `${fmt(t?.roll_deg, 1)}° / ${fmt(t?.pitch_deg, 1)}° / ${fmt(t?.yaw_deg, 1)}°`],
    ["UPDATED", updated],
  ];

  return (
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
  );
}

