import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { MissionState, Telemetry, Waypoint } from "../api/types";
import { Pill } from "./Pill";

interface MissionEditorProps {
  telemetry: Telemetry | null;
  onMissionChange: (waypoints: Waypoint[]) => void;
  notify: (text: string, error?: boolean) => void;
}

// The four-corner mission PX4 SITL launches over (ETH Zurich), provided
// as a one-click template so the operator can sanity-check a fresh build.
const SITL_SQUARE: Waypoint[] = [
  [47.397751, 8.545607, 10],
  [47.397751, 8.546107, 10],
  [47.397451, 8.546107, 10],
  [47.397451, 8.545607, 10],
];

// Build a roughly-square mission around (lat, lon) using a flat-earth
// approximation. Fine for the small distances this UI cares about.
function squareAround(lat: number, lon: number, sizeMeters: number, altM: number): Waypoint[] {
  const dLat = sizeMeters / 2 / 111111;
  const dLon = sizeMeters / 2 / (111111 * Math.cos((lat * Math.PI) / 180));
  return [
    [lat + dLat, lon - dLon, altM],
    [lat + dLat, lon + dLon, altM],
    [lat - dLat, lon + dLon, altM],
    [lat - dLat, lon - dLon, altM],
  ];
}

export function MissionEditor({ telemetry, onMissionChange, notify }: MissionEditorProps) {
  const [jsonText, setJsonText] = useState("");
  const [speed, setSpeed] = useState(5);
  const [count, setCount] = useState(0);

  // Hydrate from the backend on mount so a page refresh doesn't drop the
  // mission the operator already uploaded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<MissionState>("/api/mission");
        if (cancelled) return;
        if (data.waypoints?.length) {
          setJsonText(JSON.stringify(data.waypoints, null, 2));
          setSpeed(data.speed_mps);
          setCount(data.waypoints.length);
          onMissionChange(data.waypoints);
        }
      } catch (err) {
        // Auth 401 is handled centrally; quietly drop other errors here so
        // the editor stays usable even with the backend offline.
        if (!(err instanceof ApiError) || err.status !== 401) {
          /* swallow */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onMissionChange]);

  function loadIntoEditor(waypoints: Waypoint[]) {
    setJsonText(JSON.stringify(waypoints, null, 2));
    setCount(waypoints.length);
    onMissionChange(waypoints);
  }

  async function upload() {
    let parsed: Waypoint[];
    try {
      parsed = JSON.parse(jsonText) as Waypoint[];
    } catch (err) {
      notify(`Mission JSON invalid: ${(err as Error).message}`, true);
      return;
    }
    try {
      const result = await api.post<{ ok?: boolean; count?: number }>("/api/mission", {
        waypoints: parsed,
        speed_mps: speed,
      });
      if (result?.ok) {
        setCount(result.count ?? parsed.length);
        onMissionChange(parsed);
        notify(`Uploaded ${result.count ?? parsed.length} waypoints`);
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? `upload: ${err.detail}` : (err as Error).message;
      notify(message, true);
    }
  }

  function loadSquareHere() {
    if (
      !telemetry ||
      !Number.isFinite(telemetry.lat) ||
      Math.abs(telemetry.lat) < 1e-4
    ) {
      notify("Need a GPS fix to build a local mission.", true);
      return;
    }
    loadIntoEditor(squareAround(telemetry.lat, telemetry.lon, 60, 10));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Mission
        </h2>
        <Pill>{count} wp</Pill>
      </div>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        placeholder="[[lat, lon, alt_m], [lat, lon, alt_m], ...]"
        className="block min-h-[110px] w-full resize-y rounded-md border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-slate-100 outline-none focus:border-sky-500"
      />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-xs text-slate-400">
          speed
          <input
            type="number"
            min={1}
            max={20}
            step={0.5}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value) || 5)}
            className="w-16 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-sm tabular-nums outline-none focus:border-sky-500"
          />
          m/s
        </label>
        <button
          type="button"
          onClick={() => void upload()}
          className="rounded-md border border-sky-700 bg-sky-900/60 px-3 py-1.5 text-sm transition hover:border-sky-500"
        >
          Upload Mission
        </button>
        <button
          type="button"
          onClick={() => loadIntoEditor(SITL_SQUARE)}
          className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm transition hover:border-sky-500"
        >
          SITL square
        </button>
        <button
          type="button"
          onClick={loadSquareHere}
          className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm transition hover:border-sky-500"
        >
          Square at current pos
        </button>
      </div>
    </div>
  );
}
