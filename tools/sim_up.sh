#!/usr/bin/env bash
# Pixhawk-on-Pi simulation orchestrator.
#
# Brings up PX4 SITL and the dashboard in a single tmux session so you can
# fly the simulated quadcopter from a browser pointed at this Pi.
#
# Usage:
#   tools/sim_up.sh                # start SITL + dashboard (SITL conn)
#   tools/sim_up.sh hw             # start dashboard only, talk to USB Pixhawk
#   tools/sim_up.sh down           # tear it all down
#
# Requirements (one-time):
#   - PX4-Autopilot built once: `cd ~/PX4-Autopilot && make px4_sitl none_iris`
#   - Project venv at ~/pixhawk/.venv with dashboard deps installed:
#       ~/pixhawk/.venv/bin/pip install -r ~/pixhawk/dashboard/requirements.txt
#   - tmux:  sudo apt install tmux
#
# Credentials:
#   - Set DASHBOARD_USER / DASHBOARD_PASS in your shell (or systemd unit)
#     before calling this script if you don't want a one-shot random password.

set -euo pipefail

SESSION=drone
PIX_DIR="${PIX_DIR:-$HOME/pixhawk}"
PX4_DIR="${PX4_DIR:-$HOME/PX4-Autopilot}"
VENV="${VENV:-$PIX_DIR/.venv}"
SITL_TARGET="${SITL_TARGET:-none_iris}"
HOST="${DASHBOARD_HOST:-0.0.0.0}"
PORT="${DASHBOARD_PORT:-8000}"

cmd="${1:-up}"

have() { command -v "$1" >/dev/null 2>&1; }

require_tmux() {
  if ! have tmux; then
    echo "tmux not installed. Run: sudo apt install -y tmux" >&2
    exit 1
  fi
}

require_venv() {
  if [[ ! -x "$VENV/bin/python" ]]; then
    echo "Project venv not found at $VENV" >&2
    echo "Create it per ~/pixhawk/README.md, then install dashboard deps:" >&2
    echo "  $VENV/bin/pip install -r $PIX_DIR/dashboard/requirements.txt" >&2
    exit 1
  fi
}

start_dashboard_window() {
  local conn="$1"
  tmux new-window -t "$SESSION" -n dashboard \
    "cd '$PIX_DIR' && \
     export DRONE_CONN='$conn' DASHBOARD_HOST='$HOST' DASHBOARD_PORT='$PORT' \
           DASHBOARD_USER='${DASHBOARD_USER:-azaharia}' \
            DASHBOARD_PASS='${DASHBOARD_PASS:-}' \
            DASHBOARD_SECRET='${DASHBOARD_SECRET:-}' \
         DASHBOARD_API_TOKEN='${DASHBOARD_API_TOKEN:-}' \
            DRONE_CAM='${DRONE_CAM:-/dev/video0}' && \
     '$VENV/bin/python' -m dashboard.server --conn \"\$DRONE_CONN\" --host \"\$DASHBOARD_HOST\" --port \"\$DASHBOARD_PORT\"; \
     echo; echo '[dashboard exited — press any key to close]'; read -n1"
}

case "$cmd" in
  up)
    require_tmux; require_venv
    if [[ ! -d "$PX4_DIR" ]]; then
      echo "PX4-Autopilot not found at $PX4_DIR (set PX4_DIR=...)" >&2
      exit 1
    fi
    tmux has-session -t "$SESSION" 2>/dev/null && {
      echo "Session '$SESSION' already up. Attach with:  tmux attach -t $SESSION"
      exit 0
    }
    echo "Starting PX4 SITL ($SITL_TARGET) and dashboard in tmux session '$SESSION'..."
    # Window 0: PX4 SITL
    tmux new-session -d -s "$SESSION" -n px4 \
      "cd '$PX4_DIR' && HEADLESS=1 PX4_SIM_SPEED_FACTOR=\${PX4_SIM_SPEED_FACTOR:-1} make px4_sitl $SITL_TARGET; \
       echo; echo '[PX4 SITL exited — press any key to close]'; read -n1"
    # Window 1: dashboard (talks to SITL on UDP 14540)
    start_dashboard_window "udpin://0.0.0.0:14540"
    tmux select-window -t "$SESSION":dashboard
    echo
    echo "Dashboard:  http://$(hostname -I | awk '{print $1}'):$PORT/"
    echo "Attach:     tmux attach -t $SESSION"
    echo "Tear down:  $0 down"
    ;;

  hw)
    require_tmux; require_venv
    PORT_DEV="${PIXHAWK_DEV:-/dev/serial/by-id/usb-Auterion_PX4_FMU_v6C.x_0-if00}"
    BAUD="${PIXHAWK_BAUD:-115200}"
    if [[ ! -e "$PORT_DEV" ]]; then
      echo "Pixhawk device not found: $PORT_DEV" >&2
      echo "Set PIXHAWK_DEV=... or plug in the autopilot." >&2
      exit 1
    fi
    tmux has-session -t "$SESSION" 2>/dev/null && {
      echo "Session '$SESSION' already up. Attach with:  tmux attach -t $SESSION"
      exit 0
    }
    echo "Starting dashboard against real Pixhawk at $PORT_DEV..."
    tmux new-session -d -s "$SESSION" -n placeholder "echo 'hardware mode'; sleep infinity"
    start_dashboard_window "serial://$PORT_DEV:$BAUD"
    tmux kill-window -t "$SESSION":placeholder
    tmux select-window -t "$SESSION":dashboard
    echo
    echo "Dashboard:  http://$(hostname -I | awk '{print $1}'):$PORT/"
    echo "Attach:     tmux attach -t $SESSION"
    ;;

  down)
    tmux has-session -t "$SESSION" 2>/dev/null || { echo "no session"; exit 0; }
    tmux kill-session -t "$SESSION"
    echo "torn down."
    ;;

  attach)
    require_tmux
    tmux attach -t "$SESSION"
    ;;

  status)
    require_tmux
    tmux has-session -t "$SESSION" 2>/dev/null && {
      echo "session '$SESSION' is UP"
      tmux list-windows -t "$SESSION"
    } || echo "session '$SESSION' is DOWN"
    ;;

  *)
    echo "Usage: $0 {up|hw|down|attach|status}" >&2
    exit 2
    ;;
esac
