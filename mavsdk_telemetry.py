#!/usr/bin/env python3
"""Minimal MAVSDK example: connect and stream position.

Run inside the project venv:
    source ~/pixhawk/.venv/bin/activate
    python mavsdk_telemetry.py

Notes:
- MAVSDK talks to the autopilot via mavsdk_server (auto-launched by the lib).
- Serial URI format: serial:///dev/ttyACM0:115200
"""
import asyncio
from mavsdk import System

URI = "serial:///dev/ttyACM0:115200"

async def run() -> None:
    drone = System()
    await drone.connect(system_address=URI)

    print("Waiting for autopilot connection...")
    async for state in drone.core.connection_state():
        if state.is_connected:
            print("Connected.")
            break

    info = await drone.info.get_version()
    print(f"Flight SW: {info.flight_sw_major}.{info.flight_sw_minor}.{info.flight_sw_patch}")

    async for pos in drone.telemetry.position():
        print(f"lat={pos.latitude_deg:.7f}  lon={pos.longitude_deg:.7f}  "
              f"abs_alt={pos.absolute_altitude_m:.1f}m  rel_alt={pos.relative_altitude_m:.1f}m")

if __name__ == "__main__":
    asyncio.run(run())
