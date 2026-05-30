#!/usr/bin/env python3
"""First autonomous mission: preflight checks -> arm -> takeoff 5 m -> land.

Designed to be safe to run against PX4 SITL OR a real Pixhawk on the bench
(props OFF for bench tests!). All actions are gated behind explicit health
checks so the script bails out early if the vehicle isn't ready.

Run inside the project venv:
    source ~/pixhawk/.venv/bin/activate

    # SITL (PX4 sim, no hardware):
    python missions/preflight_takeoff_land.py --conn udp://:14540

    # Real Pixhawk over USB (PROPS OFF for the first test):
    python missions/preflight_takeoff_land.py --conn serial:///dev/ttyACM0:115200
"""
from __future__ import annotations

import argparse
import asyncio
import sys

from mavsdk import System
from mavsdk.action import ActionError
from mavsdk.telemetry import FlightMode, LandedState


DEFAULT_CONN = "udp://:14540"   # PX4 SITL default offboard port
TAKEOFF_ALT_M = 5.0
HEALTH_TIMEOUT_S = 60
ARM_TIMEOUT_S = 15
HOVER_SECONDS = 8


async def wait_connected(drone: System) -> None:
    print(f"Connecting...")
    async for state in drone.core.connection_state():
        if state.is_connected:
            print("  connected.")
            return


async def wait_health_ok(drone: System) -> None:
    """Block until PX4 reports everything needed for an autonomous takeoff."""
    print("Waiting for health checks (GPS, home, calibrations)...")
    deadline = asyncio.get_event_loop().time() + HEALTH_TIMEOUT_S
    async for h in drone.telemetry.health():
        remaining = deadline - asyncio.get_event_loop().time()
        status = (
            f"gyro={h.is_gyrometer_calibration_ok} "
            f"accel={h.is_accelerometer_calibration_ok} "
            f"mag={h.is_magnetometer_calibration_ok} "
            f"localpos={h.is_local_position_ok} "
            f"globalpos={h.is_global_position_ok} "
            f"home={h.is_home_position_ok} "
            f"armable={h.is_armable}"
        )
        print(f"  [{remaining:5.1f}s] {status}")
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


async def print_battery_once(drone: System) -> None:
    async for b in drone.telemetry.battery():
        pct = b.remaining_percent * 100 if b.remaining_percent <= 1 else b.remaining_percent
        print(f"Battery: {b.voltage_v:.2f} V  ({pct:.0f}%)")
        if b.voltage_v > 0 and pct < 30:
            raise RuntimeError(f"Battery too low to fly: {pct:.0f}%")
        return


async def set_takeoff_altitude(drone: System, alt_m: float) -> None:
    print(f"Setting takeoff altitude to {alt_m:.1f} m")
    await drone.action.set_takeoff_altitude(alt_m)


async def arm_with_timeout(drone: System) -> None:
    print("Arming...")
    try:
        await asyncio.wait_for(drone.action.arm(), timeout=ARM_TIMEOUT_S)
    except ActionError as e:
        raise RuntimeError(f"Arm refused by autopilot: {e}") from e
    print("  armed.")


async def wait_landed(drone: System) -> None:
    print("Waiting for LANDED state...")
    async for ls in drone.telemetry.landed_state():
        print(f"  landed_state={ls.name}")
        if ls == LandedState.ON_GROUND:
            return


async def run(conn: str, alt_m: float) -> int:
    drone = System()
    await drone.connect(system_address=conn)
    await wait_connected(drone)

    await wait_health_ok(drone)
    await print_battery_once(drone)

    await set_takeoff_altitude(drone, alt_m)
    await arm_with_timeout(drone)

    print("Takeoff...")
    await drone.action.takeoff()

    # Wait until we're actually in the air.
    async for ls in drone.telemetry.landed_state():
        if ls == LandedState.IN_AIR:
            print("  airborne.")
            break

    print(f"Hovering for {HOVER_SECONDS}s...")
    await asyncio.sleep(HOVER_SECONDS)

    print("Land...")
    await drone.action.land()
    await wait_landed(drone)

    # PX4 usually auto-disarms after landing; call disarm defensively.
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
    p.add_argument("--alt", type=float, default=TAKEOFF_ALT_M,
                   help=f"Takeoff altitude in meters (default: {TAKEOFF_ALT_M})")
    return p.parse_args()


async def _main() -> int:
    args = parse_args()
    try:
        return await run(args.conn, args.alt)
    except (RuntimeError, TimeoutError) as e:
        print(f"ABORT: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
