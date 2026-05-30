# PX4 SITL on this Pi

Goal: run the same autopilot firmware your Pixhawk runs, but as a process
on the Pi, so mission scripts can be developed without risking the drone.

The Pi is arm64 / Debian 13. Headless SITL (no Gazebo, no jMAVSim GUI) is
the right target — Gazebo is too heavy and we don't need 3D rendering.

## One-time install

```bash
cd ~
git clone https://github.com/PX4/PX4-Autopilot.git --recursive
cd PX4-Autopilot

# PX4 dev setup. Answers 'y' to everything it asks.
bash ./Tools/setup/ubuntu.sh --no-nuttx --no-sim-tools

# Headless SITL build for a generic quadcopter. First build is slow (~30 min on a Pi).
make px4_sitl none_iris
```

The build leaves a `px4` binary you can re-launch any time with:

```bash
cd ~/PX4-Autopilot
make px4_sitl none_iris
```

While `px4` is running it opens:
- **UDP 14540** for offboard / MAVSDK / DroneKit / pymavlink scripts.
- **UDP 14550** for ground stations (QGC, MAVProxy).

## Fly the first mission in SITL

In one terminal, start the simulator:

```bash
cd ~/PX4-Autopilot && make px4_sitl none_iris
```

In a second terminal:

```bash
source ~/pixhawk/.venv/bin/activate
python ~/pixhawk/missions/preflight_takeoff_land.py --conn udp://:14540
```

Optionally watch it with MAVProxy in a third terminal:

```bash
mavproxy.py --master=udp:127.0.0.1:14550 --console
```

## Moving the same script to real hardware

```bash
python ~/pixhawk/missions/preflight_takeoff_land.py \
    --conn serial:///dev/ttyACM0:115200
```

**Bench test with props OFF first.** The script's preflight gate will
refuse to arm without GPS lock + home position, so indoors it will time
out — that is the safety feature working.
