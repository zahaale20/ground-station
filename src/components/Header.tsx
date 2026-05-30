import { Pill } from "./Pill";
import { useAuth } from "../auth/AuthContext";
import type { Telemetry } from "../api/types";

interface HeaderProps {
  telemetry: Telemetry | null;
  socketState: "connecting" | "open" | "closed";
}

// Top status strip: connection / armed / flight mode / landed pills + logout.
// All state is derived from the most recent telemetry frame.
export function Header({ telemetry, socketState }: HeaderProps) {
  const { logout } = useAuth();

  const connected = !!telemetry?.connected;
  const armed = !!telemetry?.armed;
  const mode = telemetry?.flight_mode ?? "?";
  const inAir = !!telemetry?.in_air;
  const landed = telemetry?.landed_state ?? "?";

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-5 py-2.5">
      <h1 className="text-base font-semibold tracking-wide">Drone Ground Station</h1>
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={socketState === "open" ? (connected ? "ok" : "warn") : "bad"}>
          {socketState === "open"
            ? connected
              ? "connected"
              : "ws ok / drone offline"
            : socketState === "connecting"
              ? "connecting…"
              : "disconnected"}
        </Pill>
        <Pill tone={armed ? "warn" : "default"}>{armed ? "ARMED" : "disarmed"}</Pill>
        <Pill tone={mode && mode !== "UNKNOWN" && mode !== "?" ? "ok" : "default"}>
          mode: {mode}
        </Pill>
        <Pill tone={inAir ? "warn" : "default"}>{inAir ? "IN AIR" : landed}</Pill>
        <button
          onClick={() => void logout()}
          className="ml-2 rounded-full border border-slate-800 px-2.5 py-0.5 text-xs text-slate-400 transition hover:border-sky-600 hover:text-slate-100"
        >
          log out
        </button>
      </div>
    </header>
  );
}
