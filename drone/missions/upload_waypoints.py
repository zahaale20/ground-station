#!/usr/bin/env python3
"""Upload a list of waypoints to the autopilot and fly the mission.

Waypoints are (lat_deg, lon_deg, alt_m_relative_to_home). The script:
  1. Connects + waits for health (GPS, home, armable).
  2. Builds a mission: takeoff -> waypoints -> RTL (return + land at home).
  3. Uploads it, arms, starts AUTO mission, prints live progress, waits for
     landed state, disarms.

Run inside the project venv:
    source ~/pixhawk/.venv/bin/activate

    # SITL:
    python missions/upload_waypoints.py --conn udp://:14540

    # Real Pixhawk (outdoors, GPS lock, props on at your own risk):
    python missions/upload_waypoints.py --conn serial:///dev/ttyACM0:115200 \
        --waypoints waypoints.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from mavsdk import System
from mavsdk.action import ActionError
from mavsdk.mission import MissionItem, MissionPlan, MissionError
from mavsdk.telemetry import LandedState


DEFAULT_CONN = "udp://:14540"
DEFAULT_SPEED_MPS = 5.0
HEALTH_TIMEOUT_S = 60

# Default mission for SITL: a small square around the PX4 SITL home position
# (Zurich, ETH). Override with --waypoints path/to/file.json.
DEFAULT_WAYPOINTS = [
    # (lat, lon, alt_m)
    (47.397751, 8.545607,  10.0),
    (47.397751, 8.546107,  10.0),
    (47.397451, 8.546107,  10.0),
    (47.397451, 8.545607,  10.0),
]


def load_waypoints(path: str | None) -> list[tuple[float, float, float]]:
    if path is None:
        return DEFAULT_WAYPOINTS
    raw = json.loads(Path(path).read_text())
    out: list[tuple[float, float, float]] = []
    for i, wp in enumerate(raw):
        if not (isinstance(wp, (list, tuple)) and len(wp) == 3):
            raise ValueError(f"waypoint {i} must be [lat, lon, alt_m], got {wp!r}")
        lat, lon, alt = float(wp[0]), float(wp[1]), float(wp[2])
        if not -90 <= lat <= 90 or not -180 <= lon <= 180:
            raise ValueError(f"waypoint {i} out of range: {wp!r}")
        if not 0 < alt <= 120:
            raise ValueError(f"waypoint {i} alt must be in (0, 120] m, got {alt}")
        out.append((lat, lon, alt))
    if not out:
        raise ValueError("waypoint file is empty")
    return out


def build_mission(
    waypoints: list[tuple[float, float, float]], speed_mps: float
) -> MissionPlan:
    items: list[MissionItem] = []
    for lat, lon, alt in waypoints:
        items.append(
            MissionItem(
                latitude_deg=lat,
                longitude_deg=lon,
                relative_altitude_m=alt,
                speed_m_s=speed_mps,
                is_fly_through=True,
                gimbal_pitch_deg=float("nan"),
                gimbal_yaw_deg=float("nan"),
                camera_action=MissionItem.CameraAction.NONE,
                loiter_time_s=float("nan"),
                camera_photo_interval_s=float("nan"),
                acceptance_radius_m=2.0,
                yaw_deg=float("nan"),
                camera_photo_distance_m=float("nan"),
                vehicle_action=MissionItem.VehicleAction.NONE,
            )
        )
    return MissionPlan(items)


async def wait_connected(drone: System) -> None:
    print("Connecting...")
    async for state in drone.core.connection_state():
        if state.is_connected:
            print("  connected.")
            return


async def wait_health_ok(drone: System) -> None:
    print("Waiting for health (GPS, home, calibrations)...")
    deadline = asyncio.get_event_loop().time() + HEALTH_TIMEOUT_S
    async for h in drone.telemetry.health():
        remaining = deadline - asyncio.get_event_loop().time()
        print(
            f"  [{remaining:5.1f}s] globalpos={h.is_global_position_ok} "
            f"home={h.is_home_position_ok} armable={h.is_armable}"
        )
        if (
            h.is_gyrometer_calibration_ok
            and h.is_accelerometer_calibration_ok
            and h.is_magnetometer_calibration_ok
            and h.is_local_position_ok
            and h.is_global_position_ok
            and h.is_home_position_ok
            and h.is_armable
        ):
            print("  health OK.")
            return
        if remaining <= 0:
            raise TimeoutError("Vehicle did not become healthy in time")


async def print_progress(drone: System, total: int) -> None:
    async for p in drone.mission.mission_progress():
        print(f"  waypoint {p.current}/{p.total}")
        if p.current >= total:
            return


async def run(conn: str, waypoints: list[tuple[float, float, float]],
              speed_mps: float) -> int:
    drone = System()
    await drone.connect(system_address=conn)
    await wait_connected(drone)
    await wait_health_ok(drone)

    plan = build_mission(waypoints, speed_mps)
    print(f"Uploading {len(plan.mission_items)} waypoints @ {speed_mps:.1f} m/s")
    try:
        await drone.mission.set_return_to_launch_after_mission(True)
        await drone.mission.upload_mission(plan)
    except MissionError as e:
        raise RuntimeError(f"Mission upload failed: {e}") from e

    print("Arming...")
    try:
        await drone.action.arm()
    except ActionError as e:
        raise RuntimeError(f"Arm refused: {e}") from e

    print("Starting mission (AUTO)...")
    await drone.mission.start_mission()

    progress_task = asyncio.create_task(print_progress(drone, len(plan.mission_items)))

    # When the final waypoint is reached, set_return_to_launch_after_mission(True)
    # will trigger RTL and land. Wait for ground.
    print("Waiting for landed (after RTL)...")
    async for ls in drone.telemetry.landed_state():
        if ls == LandedState.ON_GROUND:
            break

    progress_task.cancel()
    try:
        await drone.action.disarm()
    except ActionError:
        pass
    print("Done.")
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--conn", default=DEFAULT_CONN,
                   help=f"MAVSDK system address (default: {DEFAULT_CONN})")
    p.add_argument("--waypoints", default=None,
                   help="Path to JSON file: [[lat, lon, alt_m], ...]. "
                        "If omitted, uses a small SITL square at PX4 home.")
    p.add_argument("--speed", type=float, default=DEFAULT_SPEED_MPS,
                   help=f"Cruise speed in m/s (default: {DEFAULT_SPEED_MPS})")
    return p.parse_args()


async def _main() -> int:
    args = parse_args()
    try:
        wps = load_waypoints(args.waypoints)
    except (ValueError, OSError, json.JSONDecodeError) as e:
        print(f"Bad waypoints: {e}", file=sys.stderr)
        return 2
    try:
        return await run(args.conn, wps, args.speed)
    except (RuntimeError, TimeoutError) as e:
        print(f"ABORT: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
