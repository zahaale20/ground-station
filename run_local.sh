#!/usr/bin/env bash
# Run the ground-station UI locally on a MacBook (or any workstation).
#
# This serves the repo root from a local http.server. Opening / in the
# browser hits index.html, which redirects to ui/index.html. The UI then
# talks to the remote drone backend at $DASHBOARD_API_URL using
# $DASHBOARD_API_TOKEN as a bearer token.
#
# Usage:
#   DASHBOARD_API_URL=http://<pi-ip>:8000 \
#   DASHBOARD_API_TOKEN=... \
#   ./run_local.sh
#
# Optional:
#   PORT=8080 BIND=127.0.0.1 ./run_local.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8000}"
BIND="${BIND:-127.0.0.1}"
API_URL="${DASHBOARD_API_URL:-http://192.168.3.172:8000}"
API_TOKEN="${DASHBOARD_API_TOKEN:-}"

if [[ -z "$API_TOKEN" ]]; then
  echo "DASHBOARD_API_TOKEN is not set." >&2
  echo "Set it to the token printed by the Pi backend startup, then rerun." >&2
  exit 1
fi

URL="http://localhost:${PORT}/?api=${API_URL}&token=${API_TOKEN}"

if command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
fi

echo "Serving ground-station UI from: $ROOT_DIR"
echo "Backend API:                   $API_URL"
echo "Open: $URL"
python3 -m http.server "$PORT" --bind "$BIND" --directory "$ROOT_DIR"
