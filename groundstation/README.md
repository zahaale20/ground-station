# Ground station

Everything in this directory runs on the **operator's laptop** (e.g. a
MacBook), not on the drone. The drone-side backend lives in
[../drone/dashboard/](../drone/dashboard/) and exposes the REST/WebSocket
API that this UI consumes.

## Layout

| Path           | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `ui/`          | The actual dashboard (map, video, flight controls, mission editor)      |
| `index.html`   | Local redirect — opens `/ui/index.html` and forwards query parameters   |
| `run_local.sh` | Serve this directory on `localhost` and open the UI pointed at the drone |

The UI is shared: the drone-side FastAPI backend mounts the same `ui/`
directory at `/`, so pointing a browser straight at the Pi (e.g.
`http://<pi-ip>:8000/`) also works. Running it locally is preferred when:

- the laptop has a much better browser / map experience than the Pi,
- you want browser geolocation (which most browsers gate on `localhost` or
  HTTPS),
- you want the UI to keep working while you cycle the Pi.

## First run

1. Start the drone-side backend (see [`../drone/README.md`](../drone/README.md)).
   On first launch it prints something like:

   ```
   [dashboard] generated api token: <TOKEN>
   ```

   Copy that token. To make it stable across restarts, set
   `DASHBOARD_API_TOKEN` in `~/.config/dashboard.env` on the drone.

2. On the laptop, from the repo root:

   ```bash
   DASHBOARD_API_URL=http://<pi-ip>:8000 \
   DASHBOARD_API_TOKEN=<TOKEN> \
   groundstation/run_local.sh
   ```

   The script serves `groundstation/` on `http://localhost:8000/` and opens
   the browser at `http://localhost:8000/?api=<...>&token=<...>`. The UI
   then talks to the drone over WebSocket and REST using the bearer token.

## Notes

- `PORT=...` and `BIND=...` are honoured by `run_local.sh` if you need to
  change the local listener.
- The MJPEG video endpoint (`/video`) is fetched from the drone backend
  directly, not the local server — so make sure the drone is reachable from
  the laptop on whatever port `DASHBOARD_API_URL` points at.
- Keep the page on `localhost` (not your LAN IP) so the browser allows
  geolocation without HTTPS.
