#!/usr/bin/env python3
"""Print live telemetry from the Pixhawk over USB.

Run inside the project venv:
    source ~/pixhawk/.venv/bin/activate
    python heartbeat.py
"""
from pymavlink import mavutil

PORT = "/dev/serial/by-id/usb-Auterion_PX4_FMU_v6C.x_0-if00"
BAUD = 115200

def main() -> None:
    m = mavutil.mavlink_connection(PORT, baud=BAUD)
    print("Waiting for heartbeat...")
    m.wait_heartbeat()
    print(f"Connected: sysid={m.target_system} compid={m.target_component}")

    # Ask for a steady stream of common messages at 4 Hz.
    m.mav.request_data_stream_send(
        m.target_system, m.target_component,
        mavutil.mavlink.MAV_DATA_STREAM_ALL, 4, 1,
    )

    while True:
        msg = m.recv_match(
            type=["ATTITUDE", "GLOBAL_POSITION_INT", "SYS_STATUS", "VFR_HUD"],
            blocking=True, timeout=5,
        )
        if msg is None:
            continue
        print(msg.get_type(), msg.to_dict())

if __name__ == "__main__":
    main()
