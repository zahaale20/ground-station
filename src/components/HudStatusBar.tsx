import type { Telemetry } from "../api/types";

interface HudStatusBarProps {
  telemetry: Telemetry | null;
  socketState: "connecting" | "open" | "closed";
}

// Game-HUD-style status row: battery cell with fill bar, link-quality bars,
// and GPS signal bars. Numerical fallbacks remain in FlightStatePanel; this
// row is for the at-a-glance "am I about to die" read.
export function HudStatusBar({ telemetry, socketState }: HudStatusBarProps) {
  const battPct = clampPct(telemetry?.battery_pct);
  const battV = telemetry?.battery_v ?? 0;
  const sats = telemetry?.gps_sats ?? 0;

  // Link quality is derived from the WebSocket state. We don't have a real
  // RSSI from MAVLink yet, so socket health is the best proxy.
  const linkBars = socketState === "open" ? (telemetry?.connected ? 4 : 2) : 0;

  // GPS bars: 0 sats = no fix, 6 = marginal, 10+ = solid. Mirrors the
  // mental model from console FPS minimaps.
  const gpsBars = sats >= 12 ? 4 : sats >= 8 ? 3 : sats >= 5 ? 2 : sats > 0 ? 1 : 0;

  return (
    <div className="flex items-center gap-3" aria-label="HUD status">
      <BatteryCell pct={battPct} volts={battV} />
      <Bars label="LINK" filled={linkBars} max={4} />
      <Bars label="GPS" filled={gpsBars} max={4} />
    </div>
  );
}

function clampPct(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

// Battery indicator. Color flips amber under 30% and red under 15% so the
// operator catches a dying pack from peripheral vision.
function BatteryCell({ pct, volts }: { pct: number; volts: number }) {
  const tone =
    pct < 15
      ? "bg-[var(--hud-red)]"
      : pct < 30
        ? "bg-[var(--hud-amber)]"
        : "bg-[var(--hud-green)]";
  const label = volts > 0 ? `${volts.toFixed(1)}V` : "—";
  return (
    <div
      className="flex items-center gap-1.5"
      title={`Battery ${pct.toFixed(0)}% (${label})`}
      aria-label={`battery ${pct.toFixed(0)} percent`}
    >
      <div className="relative h-3.5 w-10 border border-[var(--hud-green-dim)]">
        <div
          className={`absolute inset-y-0 left-0 ${tone} transition-[width]`}
          style={{ width: `${pct}%` }}
        />
        {/* Battery cap nub. */}
        <span className="absolute top-1/2 -right-1 h-1.5 w-0.5 -translate-y-1/2 bg-[var(--hud-green-dim)]" />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-[var(--hud-green)]">{label}</span>
    </div>
  );
}

// Stacked bars indicator (cell-signal style). Empty bars stay outlined so
// the operator can see the scale even when signal is zero.
function Bars({ label, filled, max }: { label: string; filled: number; max: number }) {
  const bars = Array.from({ length: max }, (_, i) => i < filled);
  const tone =
    filled === 0
      ? "bg-[var(--hud-red)] border-[var(--hud-red)]"
      : filled <= 1
        ? "bg-[var(--hud-amber)] border-[var(--hud-amber)]"
        : "bg-[var(--hud-green)] border-[var(--hud-green)]";
  return (
    <div
      className="flex items-end gap-0.5"
      title={`${label} ${filled}/${max}`}
      aria-label={`${label.toLowerCase()} signal ${filled} of ${max}`}
    >
      <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-[var(--hud-text-dim)]">
        {label}
      </span>
      {bars.map((on, i) => (
        <span
          key={i}
          className={`w-1 border ${
            on ? tone : "border-[var(--hud-green-dim)] bg-transparent"
          }`}
          style={{ height: `${6 + i * 3}px` }}
        />
      ))}
    </div>
  );
}
