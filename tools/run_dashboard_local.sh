#!/usr/bin/env bash
# Run the dashboard UI locally on a MacBook or other workstation.
#
# This serves the repo root on localhost so opening / automatically lands on
# the dashboard instead of a directory listing.
#
# Usage:
#   DASHBOARD_API_URL=http://192.168.3.172:8000 \
#   DASHBOARD_API_TOKEN=... \
#   tools/run_dashboard_local.sh
#
# Optional:
#   PORT=8080 BIND=127.0.0.1 tools/run_dashboard_local.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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

echo "Serving dashboard UI from: $ROOT_DIR"
echo "Open: $URL"
python3 -m http.server "$PORT" --bind "$BIND" --directory "$ROOT_DIR"
