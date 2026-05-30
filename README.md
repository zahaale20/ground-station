# Drone Ground Station

React + TypeScript + Vite + Tailwind UI for the **drone onboard service**
that lives in [`zahaale20/drone`](https://github.com/zahaale20/drone). The
app gives an operator live telemetry, a map with breadcrumb trail, MJPEG
video, flight controls, and a mission editor -- all against a single drone
over the local network.

This repo is **display only.** All sensor intake, mission management, and
future autonomy/CV processing happen on the drone; this app renders what
the drone publishes and forwards high-level operator commands back.

## Architecture in one paragraph

The drone runs a FastAPI service (`/api/*`, `/ws/telemetry`, `/video`,
`/login`, `/logout`) -- pure JSON / WebSocket / MJPEG, no UI. It uses a
session cookie for browser auth and a bearer token for headless clients.
The Vite dev server in this repo proxies all those paths to `VITE_DRONE_URL`
so the browser sees a single same-origin host. That means cookie auth from
`/login` works uniformly for `fetch`, `WebSocket`, **and** the
`<img src="/video">` MJPEG stream -- no token-in-URL workarounds.

## Quick start

```bash
# 1. Install
npm install

# 2. Point at your drone (defaults to http://localhost:8000 for SITL on the
#    same machine). Override per-shell or via .env.local:
cp .env.example .env.local
$EDITOR .env.local        # set VITE_DRONE_URL=http://<pi-ip>:8000

# 3. Run the dev server
npm run dev               # http://localhost:5173

# 4. Build for production
npm run build             # outputs to dist/
```

Open <http://localhost:5173/>, log in with the drone onboard service
credentials (`DRONE_USER` / `DRONE_PASS` in `~/.config/drone-onboard.env`
on the drone -- a random password is printed at first start if you don't
set one), and you should land on the dashboard.
## Layout

```
src/
├── main.tsx                 # React entry, wraps everything in AuthProvider
├── router.tsx               # /login + /  (RequireAuth)
├── index.css                # Tailwind import + a few Leaflet/marker overrides
├── api/
│   ├── client.ts            # fetch wrapper, ApiError, login/logout helpers
│   ├── useTelemetry.ts      # auto-reconnecting WS hook → Telemetry
│   └── types.ts             # Telemetry / DroneInfo / Waypoint shapes
├── auth/
│   └── AuthContext.tsx      # session probe + login/logout + 401 funnel
├── pages/
│   ├── Login.tsx            # username/password → cookie session
│   └── Dashboard.tsx        # main operator view
└── components/
    ├── Header.tsx           # connection / armed / mode / landed pills
    ├── MapPanel.tsx         # Leaflet map: drone, user, track, mission
    ├── VideoPanel.tsx       # MJPEG <img>
    ├── FlightStatePanel.tsx # telemetry key/value grid
    ├── HealthPanel.tsx      # boolean health pills
    ├── InfoPanel.tsx        # /api/info — vendor, FW, params
    ├── ControlsPanel.tsx    # arm / disarm / takeoff / land / RTL / etc.
    ├── MissionEditor.tsx    # JSON waypoint editor + upload
    ├── Pill.tsx             # shared status chip
    └── useToast.tsx         # local toast hook + render node
```

## Auth notes (best practice)

- We use the drone onboard service's cookie session (`SessionMiddleware` in
  `onboard/server.py`) rather than passing a bearer token in URLs. The
  cookie is `HttpOnly` from the browser's perspective, so no XSS payload can
  read it.
- All requests use `credentials: "include"` and go to relative paths that
  the dev server proxies to `VITE_DRONE_URL`. The drone service is
  JSON-only, so we never have to follow HTML redirects -- `login` and
  `logout` are plain JSON over POST.
- On `401` from any API call, the `AuthContext` flips status to
  `anonymous` and the router redirects to `/login`. The WS close code
  `4401` (used by the drone backend) does the same thing.

## Testing

```bash
npm install            # picks up vitest devDeps
npm test               # vitest run --reporter=verbose
npm run test:watch     # vitest watch
```

Unit tests live next to the modules they cover (`src/**/*.test.ts(x)`)
and exercise the API client's JSON-only auth contract, the auth context's
401 funnel, and the telemetry WS reconnect logic.

## Production deploy

`npm run build` emits a static `dist/`. Serve it from any static host
(nginx, Caddy, GitHub Pages, an S3 bucket, Cloudflare Pages) and point its
requests at the drone's onboard service via reverse proxy. **Do not serve
it from the drone itself** -- the drone is intentionally a pure API host
so it can stay locked down, lightweight, and bandwidth-conservative.
