import type { ReactNode } from "react";

type Tone = "default" | "ok" | "warn" | "bad";

// Phosphor tones map to the cockpit color language: green = nominal,
// amber = caution, red = master-warning. "default" stays dim so off-state
// indicators read as "no signal" rather than as a positive status.
const toneClasses: Record<Tone, string> = {
  default: "text-[var(--hud-text-dim)]",
  ok: "text-[var(--hud-green)]",
  warn: "text-[var(--hud-amber)]",
  bad: "text-[var(--hud-red)]",
};

// Bracket-style HUD indicator chip. The "[" and "]" glyphs are drawn by
// the .hud-pill CSS so every pill stays visually identical to an MFD label
// like [ ARMED ] or [ LINK ].
export function Pill({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={`hud-pill ${toneClasses[tone]} ${className}`}>
      {children}
    </span>
  );
}

