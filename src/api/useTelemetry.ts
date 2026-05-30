import { useEffect, useRef, useState } from "react";
import type { Telemetry } from "./types";

interface TelemetryHookResult {
  telemetry: Telemetry | null;
  // Status of the WebSocket itself, not the drone's connection to the
  // autopilot (that lives inside `telemetry.connected`).
  socketState: "connecting" | "open" | "closed";
  // Set when the server closes the socket with the unauthorized code so the
  // auth layer can react.
  unauthorized: boolean;
}

// Hook that keeps an auto-reconnecting WebSocket open to /ws/telemetry and
// surfaces the latest payload. The drone onboard service pushes ~5 Hz so
// we don't throttle here -- React + the dashboard's coarse-grained text
// renders cope fine at that rate.
export function useTelemetry(enabled: boolean): TelemetryHookResult {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed">(
    "closed",
  );
  const [unauthorized, setUnauthorized] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close();
      wsRef.current = null;
      setSocketState("closed");
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setSocketState("connecting");
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/telemetry`);
      wsRef.current = ws;

      ws.onopen = () => {
        setSocketState("open");
        // The backend's ws_telemetry loop awaits a receive_text() to keep the
        // connection alive; send a no-op so the broadcast pump starts pushing.
        try {
          ws.send("hi");
        } catch {
          /* ignore */
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as Telemetry;
          setTelemetry(data);
        } catch {
          // Malformed payloads are dropped silently; surfacing them in the UI
          // would just create noise during a transient backend glitch.
        }
      };

      ws.onclose = (event) => {
        setSocketState("closed");
        wsRef.current = null;
        // 4401 is the custom code the backend uses for missing/invalid auth.
        if (event.code === 4401) {
          setUnauthorized(true);
          return;
        }
        if (!cancelled) {
          reconnectTimer.current = window.setTimeout(connect, 1500);
        }
      };

      ws.onerror = () => {
        // Let onclose handle reconnection logic; errors arrive paired.
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled]);

  return { telemetry, socketState, unauthorized };
}
