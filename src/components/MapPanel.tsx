import { useEffect, useRef, useState } from "react";
import L, { Map as LeafletMap, Marker, Polyline, CircleMarker, Circle } from "leaflet";
import type { Telemetry, Waypoint } from "../api/types";
import { Pill } from "./Pill";

interface MapPanelProps {
  telemetry: Telemetry | null;
  mission: Waypoint[];
  onClearTrack: () => void;
}

// PX4 SITL home position (ETH Zurich). Sensible default until the drone
// reports a real GPS fix.
const DEFAULT_VIEW: L.LatLngTuple = [47.397751, 8.545607];

const droneIcon = L.divIcon({
  className: "drone-marker",
  iconSize: [18, 18],
  iconAnchor: [9, 14],
});

const userIcon = L.divIcon({
  className: "",
  html: '<div class="user-dot"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function hasFix(t: Telemetry | null): boolean {
  if (!t) return false;
  return Math.abs(t.lat) > 1e-4 || Math.abs(t.lon) > 1e-4;
}

function fmt(value: number | undefined, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "?";
  return value.toFixed(digits);
}

// Leaflet doesn't play nicely with React rerenders, so we hold all map
// objects in refs and mutate them imperatively in effects. The component
// only renders the container <div> and a toolbar.
export function MapPanel({ telemetry, mission, onClearTrack }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const droneMarkerRef = useRef<Marker | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const userRadiusRef = useRef<Circle | null>(null);
  const trackLineRef = useRef<Polyline | null>(null);
  const missionLineRef = useRef<Polyline | null>(null);
  const missionMarkersRef = useRef<CircleMarker[]>([]);
  const autoCenterRef = useRef(true);
  const firstFixRef = useRef(true);
  const [userInfo, setUserInfo] = useState<{ lat: number; lon: number } | null>(null);

  // One-time map setup.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView(DEFAULT_VIEW, 17);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    droneMarkerRef.current = L.marker([0, 0], { icon: droneIcon, opacity: 0 }).addTo(map);
    userMarkerRef.current = L.marker([0, 0], { icon: userIcon, opacity: 0 }).addTo(map);
    userRadiusRef.current = L.circle([0, 0], {
      radius: 1,
      color: "#58a6ff",
      weight: 2,
      fillColor: "#58a6ff",
      fillOpacity: 0.12,
      opacity: 0,
    }).addTo(map);
    trackLineRef.current = L.polyline([], {
      color: "#58a6ff",
      weight: 3,
      opacity: 0.85,
    }).addTo(map);
    missionLineRef.current = L.polyline([], {
      color: "#d29922",
      weight: 2,
      dashArray: "6 6",
    }).addTo(map);

    // Any manual interaction disables auto-pan so the operator stays in
    // control of where the map is looking.
    map.on("dragstart zoomstart", () => {
      autoCenterRef.current = false;
    });

    mapRef.current = map;

    // Opportunistic geolocation. Most browsers require secure context, so we
    // skip silently if it's not available.
    if (
      window.isSecureContext ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
    ) {
      navigator.geolocation?.getCurrentPosition(
        (pos) => applyUserLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => {
          /* user denied or unavailable */
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply telemetry updates to the drone marker, track, and (optionally) pan.
  useEffect(() => {
    const map = mapRef.current;
    const marker = droneMarkerRef.current;
    const track = trackLineRef.current;
    if (!map || !marker || !track) return;
    if (!telemetry) return;

    if (telemetry.track?.length) {
      track.setLatLngs(telemetry.track.map((p) => [p[0], p[1]] as L.LatLngTuple));
    }

    if (!hasFix(telemetry)) return;

    marker.setLatLng([telemetry.lat, telemetry.lon]).setOpacity(1);

    const iconEl = (marker as Marker & { _icon?: HTMLElement })._icon;
    if (iconEl) {
      // Strip any existing rotation Leaflet doesn't know we added, then re-
      // apply heading. Leaflet uses translate3d for position, so this is safe.
      const cleaned = iconEl.style.transform.replace(/\s*rotate\([^)]*\)/g, "");
      iconEl.style.transform = `${cleaned} rotate(${Math.round(telemetry.heading_deg || 0)}deg)`;
      iconEl.style.transformOrigin = "50% 70%";
    }

    if (firstFixRef.current) {
      map.setView([telemetry.lat, telemetry.lon], 18);
      firstFixRef.current = false;
    } else if (autoCenterRef.current) {
      map.panTo([telemetry.lat, telemetry.lon], { animate: true, duration: 0.25 });
    }
  }, [telemetry]);

  // Render mission line + waypoint markers when the mission changes.
  useEffect(() => {
    const map = mapRef.current;
    const line = missionLineRef.current;
    if (!map || !line) return;

    missionMarkersRef.current.forEach((m) => map.removeLayer(m));
    missionMarkersRef.current = [];

    line.setLatLngs(mission.map((w) => [w[0], w[1]] as L.LatLngTuple));
    mission.forEach((w, i) => {
      const m = L.circleMarker([w[0], w[1]], {
        radius: 7,
        color: "#d29922",
        weight: 2,
        fillColor: "#3f2f0f",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip(`#${i + 1} · ${w[2]} m`);
      missionMarkersRef.current.push(m);
    });
  }, [mission]);

  function applyUserLocation(lat: number, lon: number, accuracy: number) {
    setUserInfo({ lat, lon });
    userMarkerRef.current?.setLatLng([lat, lon]).setOpacity(1);
    userRadiusRef.current
      ?.setLatLng([lat, lon])
      .setRadius(Math.max(accuracy || 1, 1))
      .setStyle({ opacity: 0.65 });
  }

  function focusMyLocation() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyUserLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        autoCenterRef.current = false;
        const map = mapRef.current;
        if (map) map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 16));
      },
      () => {
        /* swallow; geolocation errors are surfaced via the map info chip */
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
  }

  function centerOnDrone() {
    autoCenterRef.current = true;
    if (telemetry && hasFix(telemetry)) {
      const map = mapRef.current;
      if (map) map.setView([telemetry.lat, telemetry.lon], Math.max(map.getZoom(), 17));
    }
  }

  function fitMission() {
    const map = mapRef.current;
    if (!map) return;
    const points: L.LatLngTuple[] = mission.map((w) => [w[0], w[1]]);
    if (telemetry && hasFix(telemetry)) points.push([telemetry.lat, telemetry.lon]);
    if (!points.length) return;
    autoCenterRef.current = false;
    map.fitBounds(L.latLngBounds(points).pad(0.25));
  }

  const fix = hasFix(telemetry);
  const infoText = fix
    ? `${fmt(telemetry?.lat, 5)}, ${fmt(telemetry?.lon, 5)} · ${fmt(telemetry?.rel_alt_m, 1)} m`
    : userInfo
      ? `me ${fmt(userInfo.lat, 5)}, ${fmt(userInfo.lon, 5)}`
      : "no fix";

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Map</h2>
        <Pill tone={fix ? "ok" : userInfo ? "ok" : "bad"}>{infoText}</Pill>
      </div>
      <div ref={containerRef} className="h-[420px] w-full rounded-lg bg-slate-900" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button kind="primary" onClick={focusMyLocation}>
          Focus my location
        </Button>
        <Button onClick={centerOnDrone}>Center on drone</Button>
        <Button onClick={fitMission}>Fit mission</Button>
        <Button onClick={onClearTrack}>Clear track</Button>
      </div>
    </div>
  );
}

// Small button variant shared with the map controls. Defined here to keep
// the map panel self-contained; the dashboard's main controls panel uses its
// own copy with the same Tailwind classes.
function Button({
  children,
  onClick,
  kind = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  kind?: "default" | "primary";
}) {
  const base =
    "rounded-md border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-60";
  const tone =
    kind === "primary"
      ? "border-sky-700 bg-sky-900/60 text-slate-100 hover:border-sky-500"
      : "border-slate-800 bg-slate-900 text-slate-100 hover:border-sky-500";
  return (
    <button type="button" onClick={onClick} className={`${base} ${tone}`}>
      {children}
    </button>
  );
}
