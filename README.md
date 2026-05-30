# Pixhawk drone + ground station

A two-sided project:

- [`drone/`](drone/) — everything that runs **on the aircraft**: the Pixhawk
  autopilot, the Raspberry Pi attached to it, MAVSDK mission scripts, the
  FastAPI telemetry/command backend, the MJPEG camera bridge, and the
  systemd unit that keeps it running.
- [`groundstation/`](groundstation/) — everything that runs **on the
  operator's laptop**: the browser UI (map, video, flight controls, mission
  editor) and the local launcher that opens it pointed at the drone backend.

```
.
├── drone/                     # runs on the Pi attached to the Pixhawk
│   ├── README.md              # drone-side setup, wiring, SITL notes
│   ├── sitl.md                # PX4 SITL bring-up on the Pi
│   ├── scripts/               # heartbeat.py, mavsdk_telemetry.py
│   ├── missions/              # preflight_takeoff_land.py, upload_waypoints.py, ...
│   ├── dashboard/             # FastAPI backend: /api, /ws/telemetry, /video
│   ├── systemd/               # user-level service unit + env template
│   └── tools/sim_up.sh        # tmux orchestrator for PX4 SITL + dashboard
│
└── groundstation/             # runs on the operator's laptop
    ├── README.md              # ground-station setup + first run
    ├── index.html             # local redirect into the UI
    ├── ui/                    # the actual dashboard (mounted by the backend too)
    └── run_local.sh           # serve the UI locally, point it at the drone
```

## Typical workflow

1. **Drone side** (Raspberry Pi): start the backend, either by hand or via
   the systemd unit in [`drone/systemd/`](drone/systemd/). The backend prints
   an API token at first launch.
2. **Ground-station side** (laptop): run
   [`groundstation/run_local.sh`](groundstation/run_local.sh) with the
   drone's IP and the API token. The browser opens the UI, which talks back
   to the drone over WebSocket and REST.

See [`drone/README.md`](drone/README.md) and
[`groundstation/README.md`](groundstation/README.md) for details specific to
each side.
