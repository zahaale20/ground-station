import { useCallback, useEffect, useMemo, useState } from "react";
import { useTelemetry } from "../api/useTelemetry";
import { api } from "../api/client";
import type { Waypoint } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Header } from "../components/Header";
import { MapPanel } from "../components/MapPanel";
import { VideoPanel } from "../components/VideoPanel";
import { FlightStatePanel } from "../components/FlightStatePanel";
import { HealthPanel } from "../components/HealthPanel";
import { InfoPanel } from "../components/InfoPanel";
import { ControlsPanel } from "../components/ControlsPanel";
import { MissionEditor } from "../components/MissionEditor";
import { useToast } from "../components/useToast";
import { ShortcutsOverlay } from "../components/ShortcutsOverlay";
import { useHotkeys, type Hotkey } from "../hooks/useHotkeys";

// Cockpit-style operator view. Holds the mission state that the map and the
// editor share, stitches every panel to the live telemetry stream, and
// owns the global "?" hotkey that toggles the shortcuts overlay.
export function Dashboard() {
  const { markUnauthorized } = useAuth();
  const { telemetry, socketState, unauthorized } = useTelemetry(true);
  const [mission, setMission] = useState<Waypoint[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (unauthorized) markUnauthorized();
  }, [unauthorized, markUnauthorized]);

  const handleClearTrack = useCallback(async () => {
    try {
      await api.post("/api/cmd/track/clear");
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }, [toast]);

  // Global hotkeys not owned by ControlsPanel: "?" and "/" both toggle
  // the keymap overlay, matching the convention from every modern shooter.
  const globalHotkeys: Hotkey[] = useMemo(
    () => [
      { label: "?", key: "?", shift: true, group: "help", description: "Toggle keymap", run: () => setHelpOpen((v) => !v) },
      { label: "/", key: "/", group: "help", description: "Toggle keymap", run: () => setHelpOpen((v) => !v) },
    ],
    [],
  );
  useHotkeys(globalHotkeys);

  // The overlay reads from a single merged hotkey list. We don't have
  // visibility into the ControlsPanel's list from here without lifting
  // state, so we declare the cockpit keymap as a label-only catalog. The
  // ControlsPanel registers the real handlers; this catalog just teaches
  // the operator what each key does.
  const keymapCatalog: Hotkey[] = useMemo(
    () => [
      { label: "A",       key: "a", group: "flight",      description: "Arm motors",                 run: () => {} },
      { label: "Shift+D", key: "d", group: "flight",      description: "Disarm motors",              run: () => {} },
      { label: "T",       key: "t", group: "flight",      description: "Takeoff to set altitude",    run: () => {} },
      { label: "H",       key: "h", group: "flight",      description: "Hold position",              run: () => {} },
      { label: "L",       key: "l", group: "flight",      description: "Land here",                  run: () => {} },
      { label: "Shift+R", key: "r", group: "flight",      description: "Return to launch (RTL)",     run: () => {} },
      { label: "F",       key: "f", group: "transition",  description: "Transition to fixed-wing",   run: () => {} },
      { label: "M",       key: "m", group: "transition",  description: "Transition to multicopter",  run: () => {} },
      { label: "Space",   key: " ", group: "mission",     description: "Start mission",              run: () => {} },
      { label: "P",       key: "p", group: "mission",     description: "Pause mission",              run: () => {} },
      { label: "Shift+C", key: "c", group: "mission",     description: "Clear uploaded mission",     run: () => {} },
      { label: "?",       key: "?", group: "help",        description: "Toggle this overlay",        run: () => {} },
      { label: "Esc",     key: "Escape", group: "help",   description: "Close any overlay",          run: () => {} },
    ],
    [],
  );

  return (
    <div className="flex h-full min-h-screen flex-col">
      <Header
        telemetry={telemetry}
        socketState={socketState}
        onShowHelp={() => setHelpOpen(true)}
      />

      <main className="grid flex-1 grid-cols-1 gap-3.5 p-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)]">
        {/* Left column: tactical map + flight controls + mission editor. */}
        <section className="relative hud-frame p-3.5">
          <span className="hud-corner-bl" />
          <span className="hud-corner-br" />
          <SectionLabel>TACTICAL · MAP</SectionLabel>
          <MapPanel
            telemetry={telemetry}
            mission={mission}
            onClearTrack={handleClearTrack}
          />

          <SectionLabel className="mt-5">WEAPONS · FLIGHT COMMANDS</SectionLabel>
          <ControlsPanel
            notify={toast.show}
            onClearMission={() => setMission([])}
          />
          {toast.node}

          <div className="mt-5">
            <SectionLabel>MISSION · WAYPOINT UPLOAD</SectionLabel>
            <MissionEditor
              telemetry={telemetry}
              onMissionChange={setMission}
              notify={toast.show}
            />
          </div>
        </section>

        {/* Right column: sensor pod (video) + telemetry MFD + systems + setup. */}
        <section className="relative hud-frame p-3.5">
          <span className="hud-corner-bl" />
          <span className="hud-corner-br" />

          <SectionLabel>SENSOR POD · LIVE FEED</SectionLabel>
          <VideoPanel telemetry={telemetry} />

          <SectionLabel className="mt-5">MFD · FLIGHT STATE</SectionLabel>
          <FlightStatePanel telemetry={telemetry} />

          <SectionLabel className="mt-5">SYSTEMS · HEALTH</SectionLabel>
          <HealthPanel health={telemetry?.health} />

          <SectionLabel className="mt-5">AIRFRAME · SETUP</SectionLabel>
          <InfoPanel />
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hud-green-dim)] bg-black/40 px-5 py-2 font-mono text-[10px] uppercase tracking-widest text-[var(--hud-text-dim)]">
        <span>
          Stallion VTOL · tilt-tricopter · PX4 ·{" "}
          <code className="border border-[var(--hud-green-dim)] px-1 py-0.5 text-[var(--hud-text-dim)]">
            VITE_DRONE_URL
          </code>
        </span>
        <span className="text-[var(--hud-text-dim)]">
          press <kbd className="border border-current px-1">?</kbd> for keymap
        </span>
      </footer>

      <ShortcutsOverlay
        hotkeys={keymapCatalog}
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      />
    </div>
  );
}

// Small caps section header used between every panel block. Keeps the page
// rhythm tactical instead of dashboard-y.
function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-2 flex items-center gap-2 ${className}`}>
      <span className="h-px flex-1 bg-[var(--hud-green-dim)]/40" />
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--hud-green)]">
        {children}
      </span>
      <span className="h-px flex-1 bg-[var(--hud-green-dim)]/40" />
    </div>
  );
}

