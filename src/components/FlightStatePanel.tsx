import type { Telemetry } from "../api/types";

function fmt(value: number | undefined | null, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "?";
  return value.toFixed(digits);
}

// Read-only key/value grid for the most recent telemetry frame. Empty values
// render as "?" rather than blanks so a missing field stays obvious.
export function FlightStatePanel({ telemetry }: { telemetry: Telemetry | null }) {
  const t = telemetry;
  const batteryPct =
    t && t.battery_pct >= 0 && t.battery_pct <= 100 ? `${fmt(t.battery_pct, 0)}%` : "—";
  const updated = t?.last_update
    ? new Date(t.last_update * 1000).toLocaleTimeString()
    : "?";

  const rows: Array<[string, string]> = [
    ["Flight mode", t?.flight_mode ?? "?"],
    ["Landed", t?.landed_state ?? "?"],
    ["Battery", `${fmt(t?.battery_v)} V  (${batteryPct})`],
    ["GPS", `${t?.gps_fix ?? "?"}  · ${t?.gps_sats ?? 0} sat`],
    ["Lat", fmt(t?.lat, 7)],
    ["Lon", fmt(t?.lon, 7)],
    ["Alt (rel)", `${fmt(t?.rel_alt_m)} m`],
    ["Alt (MSL)", `${fmt(t?.abs_alt_m)} m`],
    ["Ground speed", `${fmt(t?.ground_speed_mps)} m/s`],
    ["Heading", `${fmt(t?.heading_deg, 1)}°`],
    [
      "Roll / Pitch / Yaw",
      `${fmt(t?.roll_deg, 1)}° / ${fmt(t?.pitch_deg, 1)}° / ${fmt(t?.yaw_deg, 1)}°`,
    ],
    ["Updated", updated],
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {rows.map(([key, value]) => (
        <div
          key={key}
          className="flex justify-between border-b border-dashed border-slate-800/80 py-1 last:border-none"
        >
          <dt className="text-slate-400">{key}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
