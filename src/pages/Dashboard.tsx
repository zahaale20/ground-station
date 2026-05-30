import { useCallback, useEffect, useState } from "react";
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
import { useToast } from "../components/Toast";

// Single-page operator view. Holds the mission state that the map and the
// editor share, and stitches every panel to the live telemetry stream.
export function Dashboard() {
  const { markUnauthorized } = useAuth();
  const { telemetry, socketState, unauthorized } = useTelemetry(true);
  const [mission, setMission] = useState<Waypoint[]>([]);
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

  return (
    <div className="flex h-full min-h-screen flex-col">
      <Header telemetry={telemetry} socketState={socketState} />

      <main className="grid flex-1 grid-cols-1 gap-3.5 p-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <MapPanel
            telemetry={telemetry}
            mission={mission}
            onClearTrack={handleClearTrack}
          />

          <h2 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Flight Controls
          </h2>
          <ControlsPanel
            notify={toast.show}
            onClearMission={() => setMission([])}
          />
          {toast.node}

          <div className="mt-4">
            <MissionEditor
              telemetry={telemetry}
              onMissionChange={setMission}
              notify={toast.show}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Live Feed
          </h2>
          <VideoPanel />

          <h2 className="mt-4 mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Flight State
          </h2>
          <FlightStatePanel telemetry={telemetry} />

          <h2 className="mt-4 mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Health
          </h2>
          <HealthPanel health={telemetry?.health} />

          <h2 className="mt-4 mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Drone Setup
          </h2>
          <InfoPanel />
        </section>
      </main>

      <footer className="border-t border-slate-800 px-5 py-2 text-xs text-slate-500">
        Backend proxied via Vite (set <code className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">VITE_DRONE_URL</code>)
      </footer>
    </div>
  );
}
