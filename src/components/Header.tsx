import { Pill } from "./Pill";
import { HudStatusBar } from "./HudStatusBar";
import { useAuth } from "../auth/AuthContext";
import type { Telemetry } from "../api/types";

interface HeaderProps {
  telemetry: Telemetry | null;
  socketState: "connecting" | "open" | "closed";
  onShowHelp: () => void;
}

// Top status strip styled as an attack-helo MFD header: callsign on the
// left, master-caution + tactical pills + HUD signal bars on the right.
// Every value is derived from the most recent telemetry frame.
export function Header({ telemetry, socketState, onShowHelp }: HeaderProps) {
  const { logout } = useAuth();

  const connected = !!telemetry?.connected;
  const armed = !!telemetry?.armed;
  const mode = telemetry?.flight_mode ?? "?";
  const inAir = !!telemetry?.in_air;
  const landed = telemetry?.landed_state ?? "?";

  // Master-caution conditions: anything that would make a real pilot pull
  // back on the cyclic and check the MFD. Battery < 20% counts. Loss of
  // link counts. Armed-without-airframe-ready does NOT count here -- that
  // case is covered by the [ ARMED ] pill itself.
  const battPct = telemetry?.battery_pct ?? 100;
  const masterCaution =
    socketState !== "open" ||
    (battPct >= 0 && battPct < 20 && telemetry?.connected) ||
    (telemetry && telemetry.connected === false);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hud-green-dim)] bg-black/40 px-5 py-2">
      <div className="flex items-center gap-3">
        <div className="font-mono text-sm font-bold tracking-[0.3em] text-[var(--hud-green)]">
          STALLION&nbsp;//&nbsp;GCS
        </div>
        {masterCaution && (
          <span className="hud-pill text-[var(--hud-red)] hud-blink">
            ◆ Master Caution
          </span>
        )}
      </div>

      <HudStatusBar telemetry={telemetry} socketState={socketState} />

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={socketState === "open" ? (connected ? "ok" : "warn") : "bad"}>
          {socketState === "open"
            ? connected
              ? "link"
              : "no fcs"
            : socketState === "connecting"
              ? "linking"
              : "no link"}
        </Pill>
        <Pill tone={armed ? "warn" : "default"}>{armed ? "armed" : "safe"}</Pill>
        <Pill tone={mode && mode !== "UNKNOWN" && mode !== "?" ? "ok" : "default"}>
          {mode}
        </Pill>
        <Pill tone={inAir ? "warn" : "default"}>{inAir ? "airborne" : landed}</Pill>

        <button
          type="button"
          onClick={onShowHelp}
          title="Show keyboard shortcuts (press ?)"
          className="ml-1 border border-[var(--hud-green-dim)] bg-black/40 px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-[var(--hud-green)] transition hover:border-[var(--hud-green)] hover:text-[var(--hud-green)]"
        >
          [?] keys
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          className="border border-[var(--hud-green-dim)] bg-black/40 px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-[var(--hud-text-dim)] transition hover:border-[var(--hud-red)] hover:text-[var(--hud-red)]"
        >
          eject
        </button>
      </div>
    </header>
  );
}

