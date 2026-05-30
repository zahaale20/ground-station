# Pixhawk 6C — Workstation Setup

Hardware: Holybro/Auterion **PX4 FMU v6C.x** (USB ID `3185:0038`)
Host: Raspberry Pi, Debian 13 (trixie), arm64
Device node: `/dev/ttyACM0`
Stable symlink: `/dev/serial/by-id/usb-Auterion_PX4_FMU_v6C.x_0-if00`

## What is installed

| Tool                       | Where                                                      | Use                           |
| -------------------------- | ---------------------------------------------------------- | ----------------------------- |
| `mavproxy.py`              | pipx venv `~/.local/share/pipx/venvs/mavproxy`             | Terminal GCS, map, console    |
| `pymavlink`, `mavsdk`, `pyserial`, `dronekit` | venv `~/pixhawk/.venv`                  | Python scripting              |
| `python3-wxgtk4.0` (apt)   | system, symlinked into the mavproxy venv                   | MAVProxy `module load map`    |

QGroundControl is **not installed** — no official ARM64 AppImage. Use a
laptop for the GUI, or build from source.

## Quick start

```bash
# Terminal GCS
mavproxy.py --master=/dev/serial/by-id/usb-Auterion_PX4_FMU_v6C.x_0-if00 --baudrate=115200

# Inside MAVProxy: load helpers
module load console
module load map        # graphical map (needs X / desktop session)
status                 # vehicle info
param show SYS_AUTOSTART

# Python scripting
source ~/pixhawk/.venv/bin/activate
python heartbeat.py
python mavsdk_telemetry.py
```

## Notes / gotchas hit during setup

- `setuptools >= 81` removed `pkg_resources`, which MAVProxy still imports.
  We pinned `setuptools<81` in the MAVProxy pipx venv.
- `wxPython` has no ARM64 wheel on PyPI. We installed `python3-wxgtk4.0`
  from apt and symlinked `/usr/lib/python3/dist-packages/wx*` into the
  MAVProxy venv so the `map` module works.
- `~/.local/bin` was appended to `PATH` in `~/.bashrc`.
- ModemManager is not installed — good, it would steal `/dev/ttyACM0`.
- User `azaharia` is already in the `dialout` group.

## Network forwarding (so a laptop GCS can connect over Wi-Fi)

```bash
mavproxy.py --master=/dev/ttyACM0 --baudrate=115200 \
            --out=udp:<laptop-ip>:14550
```
On the laptop, open QGroundControl → it auto-listens on UDP 14550.
