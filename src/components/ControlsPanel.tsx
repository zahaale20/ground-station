import { useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { useHotkeys, type Hotkey } from "../hooks/useHotkeys";

interface ControlsPanelProps {
  notify: (text: string, error?: boolean) => void;
  onClearMission: () => void;
}

type Tone = "default" | "primary" | "warn" | "danger";

// Action button with a visible hotkey badge so the operator learns the
// keymap just by looking at the panel. Hold-Shift acts as the "weapon
// safety" guard on destructive commands (Disarm, RTL, Clear Mission) --
// same gesture pattern BF4 uses for the eject button.
export function ControlsPanel({ notify, onClearMission }: ControlsPanelProps) {
  const [takeoffAlt, setTakeoffAlt] = useState(5);

  async function send(path: string, body?: unknown, label?: string) {
    try {
      const json = await api.post<{ ok?: boolean; action?: string }>(path, body);
      if (json?.ok) notify((json.action ?? label ?? "ok").toUpperCase());
    } catch (err) {
      const message =
        err instanceof ApiError ? `${path}: ${err.detail}` : (err as Error).message;
      notify(message, true);
    }
  }

  // Build all command actions once so the buttons AND the global hotkey
  // hook share the exact same handlers. Single source of truth = no chance
  // of the hotkey arming the drone via a different code path than the GUI.
  const actions = useMemo(
    () => ({
      arm: () => void send("/api/cmd/arm"),
      disarm: () => void send("/api/cmd/disarm"),
      takeoff: () =>
        void send("/api/cmd/takeoff", { alt_m: takeoffAlt }, `takeoff@${takeoffAlt}m`),
      hold: () => void send("/api/cmd/hold"),
      land: () => void send("/api/cmd/land"),
      rtl: () => void send("/api/cmd/rtl"),
      transitionFw: () => void send("/api/cmd/transition_fw"),
      transitionMc: () => void send("/api/cmd/transition_mc"),
      startMission: () => void send("/api/cmd/start_mission"),
      pauseMission: () => void send("/api/cmd/pause_mission"),
      clearMission: async () => {
        await send("/api/mission/clear");
        onClearMission();
      },
    }),
    // `send` and `notify` close over takeoffAlt and notify; rebuild when alt changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [takeoffAlt],
  );

  // Hotkey map. Letters mirror the on-screen badges; Shift gates the
  // destructive commands. "Space" is start-mission because that's the
  // universal play-button gesture.
  const hotkeys: Hotkey[] = useMemo(
    () => [
      { label: "A", key: "a", group: "flight", description: "Arm motors", run: actions.arm },
      { label: "Shift+D", key: "d", shift: true, group: "flight", description: "Disarm motors", run: actions.disarm },
      { label: "T", key: "t", group: "flight", description: "Takeoff to set altitude", run: actions.takeoff },
      { label: "H", key: "h", group: "flight", description: "Hold position", run: actions.hold },
      { label: "L", key: "l", group: "flight", description: "Land here", run: actions.land },
      { label: "Shift+R", key: "r", shift: true, group: "flight", description: "Return to launch (RTL)", run: actions.rtl },
      { label: "F", key: "f", group: "transition", description: "Transition to fixed-wing", run: actions.transitionFw },
      { label: "M", key: "m", group: "transition", description: "Transition to multicopter", run: actions.transitionMc },
      { label: "Space", key: " ", group: "mission", description: "Start mission", run: actions.startMission },
      { label: "P", key: "p", group: "mission", description: "Pause mission", run: actions.pauseMission },
      { label: "Shift+C", key: "c", shift: true, group: "mission", description: "Clear uploaded mission", run: () => void actions.clearMission() },
    ],
    [actions],
  );

  useHotkeys(hotkeys);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <HudButton tone="primary" hotkey="A" onClick={actions.arm}>Arm</HudButton>
        <HudButton tone="warn" hotkey="⇧D" onClick={actions.disarm}>Disarm</HudButton>
        <HudButton tone="primary" hotkey="T" onClick={actions.takeoff}>Takeoff</HudButton>
        <input
          type="number"
          min={1}
          max={50}
          step={1}
          value={takeoffAlt}
          onChange={(e) => setTakeoffAlt(Number(e.target.value) || 5)}
          title="Takeoff altitude (m)"
          className="w-16 border border-[var(--hud-green-dim)] bg-black/60 px-2 py-1 font-mono text-sm tabular-nums text-[var(--hud-green)] outline-none focus:border-[var(--hud-green)]"
        />
        <HudButton hotkey="H" onClick={actions.hold}>Hold</HudButton>
        <HudButton hotkey="L" onClick={actions.land}>Land</HudButton>
        <HudButton tone="warn" hotkey="⇧R" onClick={actions.rtl}>RTL</HudButton>

        {/* VTOL-only transitions. PX4 rejects these on non-VTOL airframes,
            and the backend surfaces that rejection through the toast helper,
            so the buttons are safe to show unconditionally. */}
        <HudButton tone="primary" hotkey="F" onClick={actions.transitionFw}>→ Fixed-Wing</HudButton>
        <HudButton hotkey="M" onClick={actions.transitionMc}>→ Multicopter</HudButton>

        <HudButton tone="primary" hotkey="␣" onClick={actions.startMission}>Start Mission</HudButton>
        <HudButton hotkey="P" onClick={actions.pauseMission}>Pause</HudButton>
        <HudButton tone="danger" hotkey="⇧C" onClick={() => void actions.clearMission()}>
          Clear Mission
        </HudButton>
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-[var(--hud-text-dim)]">
        ⇧ = safety hold &nbsp;·&nbsp; press [?] for full keymap
      </div>
    </div>
  );
}

// Tactical HUD button with a kbd badge. Visually it's a phosphor-outlined
// chip; the tone shifts the color for hazardous commands.
function HudButton({
  children,
  onClick,
  tone = "default",
  hotkey,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: Tone;
  hotkey?: string;
}) {
  const tones: Record<Tone, string> = {
    default:
      "border-[var(--hud-green-dim)] text-[var(--hud-text)] hover:border-[var(--hud-green)] hover:text-[var(--hud-green)]",
    primary:
      "border-[var(--hud-green)] text-[var(--hud-green)] hover:bg-[var(--hud-green-dim)]/30",
    warn:
      "border-[var(--hud-amber)] text-[var(--hud-amber)] hover:bg-[var(--hud-amber-dim)]/30",
    danger:
      "border-[var(--hud-red)] text-[var(--hud-red)] hover:bg-[var(--hud-red)]/15",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border bg-black/40 px-2.5 py-1 font-mono text-xs uppercase tracking-widest transition ${tones[tone]}`}
    >
      <span>{children}</span>
      {hotkey && (
        <kbd className="rounded-sm border border-current/50 px-1 py-0 text-[10px] font-bold opacity-80">
          {hotkey}
        </kbd>
      )}
    </button>
  );
}

