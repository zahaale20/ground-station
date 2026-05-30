import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite dev server proxies every drone-facing path to VITE_DRONE_URL. That way
// the browser sees a single same-origin host, cookies set by /login work
// uniformly across fetch() and <img src="/video">, and we never have to worry
// about CORS in development.
export default defineConfig(({ mode }) => {
  // loadEnv reads .env files for the given mode without depending on the Node
  // global `process.env` directly, which keeps the config typecheckable with
  // just the Vite types.
  const env = loadEnv(mode, ".", "");
  const target = env.VITE_DRONE_URL ?? "http://localhost:8000";
  const wsTarget = target.replace(/^http/, "ws");

  const proxy: Record<string, ProxyOptions> = {
    "/api": { target, changeOrigin: true, secure: false },
    "/login": { target, changeOrigin: true, secure: false },
    "/logout": { target, changeOrigin: true, secure: false },
    "/video": { target, changeOrigin: true, secure: false },
    "/ws": { target: wsTarget, ws: true, changeOrigin: true },
  };

  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173, proxy },
    preview: { port: 4173 },
  };
});
