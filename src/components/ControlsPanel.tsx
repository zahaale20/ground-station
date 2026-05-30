import { useState } from "react";
import { api, ApiError } from "../api/client";

interface ControlsPanelProps {
  notify: (text: string, error?: boolean) => void;
  onClearMission: () => void;
}

type Tone = "default" | "primary" | "warn" | "danger";

// Wraps all imperative flight commands. Every call goes through the same
// helper so errors and toasts stay consistent and the operator can see
// exactly which command failed.
export function ControlsPanel({ notify, onClearMission }: ControlsPanelProps) {
  const [takeoffAlt, setTakeoffAlt] = useState(5);

  async function send(path: string, body?: unknown, label?: string) {
    try {
      const json = await api.post<{ ok?: boolean; action?: string }>(path, body);
      if (json?.ok) notify(json.action ?? label ?? "ok");
    } catch (err) {
      const message =
        err instanceof ApiError ? `${path}: ${err.detail}` : (err as Error).message;
      notify(message, true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button tone="primary" onClick={() => void send("/api/cmd/arm")}>Arm</Button>
      <Button onClick={() => void send("/api/cmd/disarm")}>Disarm</Button>
      <Button
        tone="warn"
        onClick={() => void send("/api/cmd/takeoff", { alt_m: takeoffAlt }, `takeoff@${takeoffAlt}m`)}
      >
        Takeoff
      </Button>
      <input
        type="number"
        min={1}
        max={50}
        step={1}
        value={takeoffAlt}
        onChange={(e) => setTakeoffAlt(Number(e.target.value) || 5)}
        title="Takeoff altitude (m)"
        className="w-16 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm tabular-nums outline-none focus:border-sky-500"
      />
      <Button onClick={() => void send("/api/cmd/hold")}>Hold</Button>
      <Button onClick={() => void send("/api/cmd/land")}>Land</Button>
      <Button tone="warn" onClick={() => void send("/api/cmd/rtl")}>RTL</Button>
      <Button tone="primary" onClick={() => void send("/api/cmd/start_mission")}>Start Mission</Button>
      <Button onClick={() => void send("/api/cmd/pause_mission")}>Pause</Button>
      <Button
        tone="danger"
        onClick={async () => {
          await send("/api/mission/clear");
          onClearMission();
        }}
      >
        Clear Mission
      </Button>
    </div>
  );
}

function Button({
  children,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: Tone;
}) {
  const tones: Record<Tone, string> = {
    default: "border-slate-800 bg-slate-900 hover:border-sky-500",
    primary: "border-sky-700 bg-sky-900/60 hover:border-sky-500",
    warn: "border-amber-700/50 bg-amber-900/40 text-amber-100 hover:border-amber-500",
    danger: "border-rose-800 bg-rose-950/60 text-rose-200 hover:border-rose-500",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm text-slate-100 transition ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
