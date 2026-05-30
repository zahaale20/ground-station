import type { Telemetry } from "../api/types";

interface VideoPanelProps {
  telemetry: Telemetry | null;
}

// Gunsight-style camera feed. The raw MJPEG stream is the background; on
// top we draw an attack-helo HUD: heading tape, pitch ladder, altitude and
// airspeed tapes, a center reticle, and the lock/target callouts. Every
// readout pulls from the live telemetry frame so the HUD tracks the drone
// the same way an Apache crewstation reads its sensor pod.
export function VideoPanel({ telemetry }: VideoPanelProps) {
  const hdg = wrapHeading(telemetry?.heading_deg ?? 0);
  const pitch = telemetry?.pitch_deg ?? 0;
  const roll = telemetry?.roll_deg ?? 0;
  const altRel = telemetry?.rel_alt_m ?? 0;
  const altMsl = telemetry?.abs_alt_m ?? 0;
  const speed = telemetry?.ground_speed_mps ?? 0;
  const armed = !!telemetry?.armed;
  const inAir = !!telemetry?.in_air;
  const mode = telemetry?.flight_mode ?? "----";

  return (
    <div className="relative overflow-hidden bg-black hud-frame">
      <span className="hud-corner-bl" />
      <span className="hud-corner-br" />

      <div className="grid aspect-video place-items-center">
        <img src="/video" alt="camera" className="h-full w-full object-contain opacity-90" />
      </div>

      {/* Everything below is a non-interactive overlay layered on the feed. */}
      <div className="hud-reticle">
        <HeadingTape heading={hdg} />
        <PitchLadder pitchDeg={pitch} rollDeg={roll} />
        <AltitudeTape altRel={altRel} altMsl={altMsl} />
        <SpeedTape speedMps={speed} />
        <Reticle armed={armed} />
        <ModeCallout mode={mode} armed={armed} inAir={inAir} />
      </div>
    </div>
  );
}

function wrapHeading(deg: number): number {
  const m = ((deg % 360) + 360) % 360;
  return Number.isFinite(m) ? m : 0;
}

// Heading tape across the top: tick marks every 10 deg, cardinal letters at
// N/E/S/W, current heading boxed in the middle (Apache-style).
function HeadingTape({ heading }: { heading: number }) {
  // Build a window of +/- 45 deg around the current heading and let the
  // browser clip outside the SVG viewport.
  const ticks: { deg: number; x: number; label: string }[] = [];
  const span = 90; // total deg visible
  for (let i = -45; i <= 45; i += 5) {
    const deg = (heading + i + 360) % 360;
    const x = ((i + span / 2) / span) * 100;
    const label = cardinal(deg) ?? (deg % 30 === 0 ? String(Math.round(deg)).padStart(3, "0") : "");
    ticks.push({ deg, x, label });
  }
  return (
    <svg
      className="absolute inset-x-0 top-0 h-12 w-full"
      viewBox="0 0 100 12"
      preserveAspectRatio="none"
    >
      <line x1="0" y1="6" x2="100" y2="6" stroke="currentColor" strokeOpacity="0.35" strokeWidth="0.15" />
      {ticks.map(({ x, label }) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <line x1="0" y1="6" x2="0" y2={label ? "3" : "4.5"} stroke="currentColor" strokeWidth="0.2" />
          {label && (
            <text x="0" y="2.5" textAnchor="middle" fontSize="2.2" fill="currentColor" className="hud-heading-tape">
              {label}
            </text>
          )}
        </g>
      ))}
      {/* Current-heading boxed readout in the middle. */}
      <g transform="translate(50 9)">
        <rect x="-5" y="-2.4" width="10" height="3.2" fill="rgba(0,0,0,0.7)" stroke="currentColor" strokeWidth="0.2" />
        <text x="0" y="0.1" textAnchor="middle" fontSize="2.6" fontWeight="700" fill="currentColor">
          {String(Math.round(heading)).padStart(3, "0")}
        </text>
      </g>
    </svg>
  );
}

function cardinal(deg: number): string | null {
  if (deg === 0) return "N";
  if (deg === 90) return "E";
  if (deg === 180) return "S";
  if (deg === 270) return "W";
  return null;
}

// Pitch ladder + bank indicator in the middle of the screen. The ladder
// translates vertically with pitch (every 10 deg = 10% of feed height) and
// the whole assembly rotates around the center with roll.
function PitchLadder({ pitchDeg, rollDeg }: { pitchDeg: number; rollDeg: number }) {
  const rungs = [-30, -20, -10, 10, 20, 30];
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="-50 -50 100 100"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform={`rotate(${-rollDeg}) translate(0 ${pitchDeg})`}>
        {/* Horizon line. */}
        <line x1="-30" y1="0" x2="-6" y2="0" stroke="currentColor" strokeWidth="0.4" />
        <line x1="6" y1="0" x2="30" y2="0" stroke="currentColor" strokeWidth="0.4" />
        {rungs.map((p) => (
          <g key={p} transform={`translate(0 ${-p})`}>
            <line
              x1="-10"
              y1="0"
              x2="-4"
              y2="0"
              stroke="currentColor"
              strokeWidth="0.3"
              strokeDasharray={p < 0 ? "1 0.8" : undefined}
            />
            <line
              x1="4"
              y1="0"
              x2="10"
              y2="0"
              stroke="currentColor"
              strokeWidth="0.3"
              strokeDasharray={p < 0 ? "1 0.8" : undefined}
            />
            <text x="-11" y="0.8" textAnchor="end" fontSize="2.5" fill="currentColor">
              {Math.abs(p)}
            </text>
            <text x="11" y="0.8" fontSize="2.5" fill="currentColor">
              {Math.abs(p)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// Vertical altitude tape on the right edge. Shows relative AGL altitude
// boxed in the middle, with MSL altitude in a smaller readout below.
function AltitudeTape({ altRel, altMsl }: { altRel: number; altMsl: number }) {
  const rel = Number.isFinite(altRel) ? altRel : 0;
  const msl = Number.isFinite(altMsl) ? altMsl : 0;
  return (
    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-end gap-1 text-[var(--hud-green)]">
      <div className="border border-[var(--hud-green)] bg-black/60 px-2 py-0.5 font-mono text-xs">
        <div className="text-[10px] uppercase tracking-widest text-[var(--hud-text-dim)]">AGL</div>
        <div className="text-right text-base font-bold tabular-nums">
          {rel.toFixed(1).padStart(6, " ")}<span className="ml-1 text-[10px] text-[var(--hud-text-dim)]">m</span>
        </div>
      </div>
      <div className="border border-[var(--hud-green-dim)] bg-black/60 px-2 py-0.5 font-mono text-[10px]">
        MSL {msl.toFixed(0)} m
      </div>
    </div>
  );
}

// Vertical airspeed/groundspeed tape on the left edge.
function SpeedTape({ speedMps }: { speedMps: number }) {
  const s = Number.isFinite(speedMps) ? speedMps : 0;
  return (
    <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-start gap-1 text-[var(--hud-green)]">
      <div className="border border-[var(--hud-green)] bg-black/60 px-2 py-0.5 font-mono text-xs">
        <div className="text-[10px] uppercase tracking-widest text-[var(--hud-text-dim)]">GND SPD</div>
        <div className="text-base font-bold tabular-nums">
          {s.toFixed(1)}<span className="ml-1 text-[10px] text-[var(--hud-text-dim)]">m/s</span>
        </div>
      </div>
      <div className="border border-[var(--hud-green-dim)] bg-black/60 px-2 py-0.5 font-mono text-[10px]">
        {(s * 3.6).toFixed(0)} kph
      </div>
    </div>
  );
}

// Center reticle. Switches from a passive sight to a "locked" reticle when
// the airframe is armed -- gives the same visual punch as a BF4 helo lock.
function Reticle({ armed }: { armed: boolean }) {
  const stroke = armed ? "var(--hud-amber)" : "var(--hud-green)";
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="-50 -50 100 100">
      <g stroke={stroke} strokeWidth="0.4" fill="none">
        {/* Crosshair. */}
        <line x1="-6" y1="0" x2="-1.5" y2="0" />
        <line x1="1.5" y1="0" x2="6" y2="0" />
        <line x1="0" y1="-6" x2="0" y2="-1.5" />
        <line x1="0" y1="1.5" x2="0" y2="6" />
        <circle cx="0" cy="0" r="0.5" fill={stroke} />
        {/* Corner brackets at +/- 12. */}
        <path d="M -12 -8 v -4 h 4" />
        <path d="M 12 -8 v -4 h -4" />
        <path d="M -12 8 v 4 h 4" />
        <path d="M 12 8 v 4 h -4" />
      </g>
    </svg>
  );
}

// Top-left tactical mode callout + master-caution slot.
function ModeCallout({ mode, armed, inAir }: { mode: string; armed: boolean; inAir: boolean }) {
  return (
    <div className="absolute left-3 top-3 flex flex-col gap-1 text-[var(--hud-green)]">
      <div className="border border-[var(--hud-green-dim)] bg-black/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest">
        MODE <span className="ml-1 font-bold text-[var(--hud-green)]">{mode}</span>
      </div>
      {armed && (
        <div className="border border-[var(--hud-amber)] bg-black/70 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--hud-amber)] hud-blink">
          ◆ ARMED
        </div>
      )}
      {inAir && (
        <div className="border border-[var(--hud-green)] bg-black/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-[var(--hud-green)]">
          ▲ AIRBORNE
        </div>
      )}
    </div>
  );
}

