"""Drone dashboard backend.

FastAPI app exposing:
  GET  /              -> static dashboard page
  GET  /api/info      -> one-shot drone setup info (version, ids, params)
  WS   /ws/telemetry  -> live MAVSDK telemetry JSON, ~5 Hz
  GET  /video         -> MJPEG stream from local camera

Run:
    source ~/pixhawk/.venv/bin/activate
    pip install -r drone/dashboard/requirements.txt
    python -m drone.dashboard.server --conn udp://:14540          # SITL
    python -m drone.dashboard.server --conn serial:///dev/ttyACM0:115200  # HW

Then open http://<pi-ip>:8000/
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import hmac
import json
import logging
import os
import secrets
import threading
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Form, Body, HTTPException
from fastapi.responses import (
    StreamingResponse, JSONResponse, HTMLResponse, RedirectResponse, Response,
)
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from mavsdk import System
from mavsdk.action import ActionError
from mavsdk.mission import MissionItem, MissionPlan, MissionError

log = logging.getLogger("dashboard")

# The ground-station UI is owned by the groundstation/ tree. The drone-side
# FastAPI backend mounts it so a browser pointed straight at the Pi gets the
# same page that the laptop launcher serves locally.
STATIC_DIR = Path(__file__).resolve().parents[2] / "groundstation" / "ui"
CAMERA_DEVICE = os.environ.get("DRONE_CAM", "/dev/video0")  # set to "none" to disable
PARAMS_OF_INTEREST = [
    "SYS_AUTOSTART", "MAV_TYPE", "COM_RC_IN_MODE", "COM_DISARM_LAND",
    "NAV_RCL_ACT", "NAV_DLL_ACT", "GF_ACTION", "MIS_TAKEOFF_ALT",
    "BAT1_N_CELLS", "BAT1_V_CHARGED", "BAT1_V_EMPTY",
]


# ---------- Auth (single-user) ----------

# Credentials come from env. If unset, a random password is generated on
# startup and printed to the console (which only someone with shell access
# to the Pi can see), so the dashboard stays locked down by default.
AUTH_USER = os.environ.get("DASHBOARD_USER", "admin")
AUTH_PASS = os.environ.get("DASHBOARD_PASS")
if not AUTH_PASS:
    AUTH_PASS = secrets.token_urlsafe(12)
    print("=" * 60, flush=True)
    print(f"[dashboard] generated login  user: {AUTH_USER}", flush=True)
    print(f"[dashboard] generated login  pass: {AUTH_PASS}", flush=True)
    print("[dashboard] set DASHBOARD_USER / DASHBOARD_PASS to override",
          flush=True)
    print("=" * 60, flush=True)

SESSION_SECRET = os.environ.get("DASHBOARD_SECRET") or secrets.token_urlsafe(32)
API_TOKEN = os.environ.get("DASHBOARD_API_TOKEN")
if not API_TOKEN:
    API_TOKEN = secrets.token_urlsafe(24)
    print(f"[dashboard] generated api token: {API_TOKEN}", flush=True)

# Paths reachable without a session.
PUBLIC_PATHS = {"/login", "/logout"}


def _is_authed(request: Request) -> bool:
    return bool(request.session.get("user"))


def _check_credentials(user: str, password: str) -> bool:
    # constant-time compare on both fields to avoid timing oracles
    u_ok = hmac.compare_digest(user.encode("utf-8"), AUTH_USER.encode("utf-8"))
    p_ok = hmac.compare_digest(password.encode("utf-8"), AUTH_PASS.encode("utf-8"))
    return u_ok and p_ok


def _render_login(error: str | None = None, status: int = 200) -> HTMLResponse:
    html = (STATIC_DIR / "login.html").read_text(encoding="utf-8")
    block = (
        f'<div class="err">{error}</div>' if error else ""
    )
    return HTMLResponse(html.replace("__ERROR__", block), status_code=status)


def _bearer_token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def _token_authed(request: Request) -> bool:
    token = _bearer_token(request)
    return bool(token and hmac.compare_digest(token.encode("utf-8"), API_TOKEN.encode("utf-8")))


class AuthGateMiddleware(BaseHTTPMiddleware):
    """Block unauthenticated requests to anything except the login flow.

    MUST be added BEFORE SessionMiddleware so SessionMiddleware ends up as the
    outer middleware and populates request.session before we read it.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in PUBLIC_PATHS:
            return await call_next(request)
        if _is_authed(request) or _token_authed(request):
            return await call_next(request)
        accept = request.headers.get("accept", "")
        if path.startswith("/api/") or path.startswith("/ws/"):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        if "text/html" in accept or path == "/" or path.endswith(".html"):
            return RedirectResponse(url="/login", status_code=303)
        return Response(status_code=401)


# ---------- Telemetry state ----------

@dataclass
class Telemetry:
    connected: bool = False
    armed: bool = False
    in_air: bool = False
    flight_mode: str = "?"
    landed_state: str = "?"
    battery_v: float = 0.0
    battery_pct: float = 0.0
    gps_fix: str = "?"
    gps_sats: int = 0
    lat: float = 0.0
    lon: float = 0.0
    abs_alt_m: float = 0.0
    rel_alt_m: float = 0.0
    ground_speed_mps: float = 0.0
    heading_deg: float = 0.0
    roll_deg: float = 0.0
    pitch_deg: float = 0.0
    yaw_deg: float = 0.0
    health: dict[str, bool] = field(default_factory=dict)
    home_set: bool = False
    armable: bool = False
    last_update: float = 0.0

    def touch(self) -> None:
        self.last_update = time.time()


STATE = Telemetry()
INFO: dict[str, Any] = {"ready": False}
CLIENTS: set[WebSocket] = set()

# Last N positions for the breadcrumb trail on the map.
TRACK_MAX = 600
TRACK: list[tuple[float, float, float]] = []  # (lat, lon, rel_alt_m)

# Cached mission plan (list of [lat, lon, alt_m]) — last thing uploaded via
# the dashboard. Survives across browser refreshes.
MISSION: dict[str, Any] = {"waypoints": [], "speed_mps": 5.0, "uploaded_at": 0.0}


# ---------- MAVSDK pumps ----------

async def _pump_connection(drone: System) -> None:
    async for s in drone.core.connection_state():
        STATE.connected = s.is_connected
        STATE.touch()


async def _pump_armed(drone: System) -> None:
    async for v in drone.telemetry.armed():
        STATE.armed = v; STATE.touch()


async def _pump_in_air(drone: System) -> None:
    async for v in drone.telemetry.in_air():
        STATE.in_air = v; STATE.touch()


async def _pump_flight_mode(drone: System) -> None:
    async for v in drone.telemetry.flight_mode():
        STATE.flight_mode = v.name; STATE.touch()


async def _pump_landed_state(drone: System) -> None:
    async for v in drone.telemetry.landed_state():
        STATE.landed_state = v.name; STATE.touch()


async def _pump_battery(drone: System) -> None:
    async for b in drone.telemetry.battery():
        STATE.battery_v = b.voltage_v
        pct = b.remaining_percent
        STATE.battery_pct = pct * 100 if pct <= 1 else pct
        STATE.touch()


async def _pump_gps(drone: System) -> None:
    async for g in drone.telemetry.gps_info():
        STATE.gps_sats = g.num_satellites
        STATE.gps_fix = g.fix_type.name
        STATE.touch()


async def _pump_position(drone: System) -> None:
    async for p in drone.telemetry.position():
        STATE.lat = p.latitude_deg
        STATE.lon = p.longitude_deg
        STATE.abs_alt_m = p.absolute_altitude_m
        STATE.rel_alt_m = p.relative_altitude_m
        STATE.touch()
        # Sample the breadcrumb trail. Skip the obvious (0,0) pre-GPS fix
        # values and points that are essentially co-located with the last one.
        if abs(p.latitude_deg) > 1e-4 or abs(p.longitude_deg) > 1e-4:
            if not TRACK or _far_enough(TRACK[-1], (p.latitude_deg, p.longitude_deg)):
                TRACK.append((p.latitude_deg, p.longitude_deg, p.relative_altitude_m))
                if len(TRACK) > TRACK_MAX:
                    del TRACK[: len(TRACK) - TRACK_MAX]


def _far_enough(prev: tuple[float, float, float], cur: tuple[float, float]) -> bool:
    # ~1 meter at the equator is ~9e-6 deg; this filters duplicates without
    # discarding real motion.
    return abs(prev[0] - cur[0]) > 5e-6 or abs(prev[1] - cur[1]) > 5e-6


async def _pump_attitude(drone: System) -> None:
    async for a in drone.telemetry.attitude_euler():
        STATE.roll_deg = a.roll_deg
        STATE.pitch_deg = a.pitch_deg
        STATE.yaw_deg = a.yaw_deg
        STATE.touch()


async def _pump_vfr(drone: System) -> None:
    async for v in drone.telemetry.velocity_ned():
        STATE.ground_speed_mps = (v.north_m_s ** 2 + v.east_m_s ** 2) ** 0.5
        STATE.touch()


async def _pump_heading(drone: System) -> None:
    async for h in drone.telemetry.heading():
        STATE.heading_deg = h.heading_deg; STATE.touch()


async def _pump_health(drone: System) -> None:
    async for h in drone.telemetry.health():
        STATE.health = {
            "gyro": h.is_gyrometer_calibration_ok,
            "accel": h.is_accelerometer_calibration_ok,
            "mag": h.is_magnetometer_calibration_ok,
            "local_pos": h.is_local_position_ok,
            "global_pos": h.is_global_position_ok,
            "home": h.is_home_position_ok,
            "armable": h.is_armable,
        }
        STATE.home_set = h.is_home_position_ok
        STATE.armable = h.is_armable
        STATE.touch()


async def _collect_info(drone: System) -> None:
    """One-shot drone setup info: version + system identifiers + key params."""
    info: dict[str, Any] = {"ready": False}
    try:
        v = await drone.info.get_version()
        info["flight_sw"] = f"{v.flight_sw_major}.{v.flight_sw_minor}.{v.flight_sw_patch}"
        info["os_sw"] = f"{v.os_sw_major}.{v.os_sw_minor}.{v.os_sw_patch}"
        info["flight_sw_git"] = v.flight_sw_git_hash
    except Exception as e:
        info["version_error"] = str(e)

    try:
        ident = await drone.info.get_identification()
        info["hardware_uid"] = ident.hardware_uid
    except Exception as e:
        info["identification_error"] = str(e)

    try:
        product = await drone.info.get_product()
        info["vendor"] = product.vendor_name
        info["product"] = product.product_name
    except Exception:
        pass

    params: dict[str, Any] = {}
    for name in PARAMS_OF_INTEREST:
        try:
            params[name] = await drone.param.get_param_int(name)
        except Exception:
            try:
                params[name] = await drone.param.get_param_float(name)
            except Exception:
                params[name] = None
    info["params"] = params
    info["ready"] = True
    INFO.clear()
    INFO.update(info)


async def _broadcaster() -> None:
    while True:
        if CLIENTS:
            payload = json.dumps({
                **asdict(STATE),
                "track": TRACK[-200:],  # last 200 pts is plenty for the map
                "mission_count": len(MISSION["waypoints"]),
            })
            dead: list[WebSocket] = []
            for ws in CLIENTS:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                CLIENTS.discard(ws)
        await asyncio.sleep(0.2)  # ~5 Hz


# ---------- MJPEG camera ----------

def _extract_jpeg(buf: bytes) -> bytes | None:
    """Return a clean JPEG from a raw V4L2 MJPG buffer, or None if it doesn't
    look like one. V4L2 buffers may be padded past the end-of-image marker."""
    soi = buf.find(b"\xff\xd8")
    if soi < 0:
        return None
    eoi = buf.rfind(b"\xff\xd9")
    if eoi < 0 or eoi < soi:
        return None
    return buf[soi:eoi + 2]


class Camera:
    """Thread-safe single-camera frame source. Returns latest JPEG bytes."""

    def __init__(self, device: str) -> None:
        self.device = device
        self.frame: bytes | None = None
        self._lock = threading.Lock()
        self._new_frame = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.error: str | None = None

    def start(self) -> None:
        if self.device == "none":
            self.error = "camera disabled (DRONE_CAM=none)"
            return
        try:
            import cv2  # noqa: F401
        except ImportError:
            self.error = "opencv-python not installed"
            return
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        import cv2
        dev: int | str = int(self.device.rsplit("video", 1)[-1]) \
            if self.device.startswith("/dev/video") else self.device
        cap = cv2.VideoCapture(dev, cv2.CAP_V4L2)
        if not cap.isOpened():
            cap = cv2.VideoCapture(dev)
        if not cap.isOpened():
            self.error = f"cannot open {self.device}"
            return
        # Real-time tuning: ask the cam for MJPG (so the USB bus isn't saturated
        # by raw YUYV), small frame, 30 fps, and a 1-frame driver buffer so
        # cap.read() never hands us a stale frame.
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        # Skip the MJPG->BGR decode entirely. With CONVERT_RGB=0 + MJPG fourcc,
        # cap.read() hands us the raw JPEG buffer the camera sent over USB.
        # We forward those bytes verbatim, which kills the libjpeg "Corrupt
        # JPEG data" warnings AND removes a decode+re-encode round-trip.
        raw_ok = cap.set(cv2.CAP_PROP_CONVERT_RGB, 0)
        while not self._stop.is_set():
            ok, frame = cap.read()
            if not ok or frame is None:
                time.sleep(0.01); continue
            jpeg = _extract_jpeg(frame.tobytes()) if raw_ok else None
            if jpeg is None:
                # Fallback: backend gave us a decoded BGR image; re-encode.
                ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                if not ok:
                    continue
                jpeg = buf.tobytes()
            with self._lock:
                self.frame = jpeg
            self._new_frame.set()
        cap.release()

    def stop(self) -> None:
        self._stop.set()

    def get(self) -> bytes | None:
        with self._lock:
            return self.frame

    async def wait_new(self, timeout: float = 1.0) -> bytes | None:
        """Block until the capture thread posts a new frame, then return it."""
        loop = asyncio.get_event_loop()
        got = await loop.run_in_executor(None, self._new_frame.wait, timeout)
        if not got:
            return None
        self._new_frame.clear()
        return self.get()


CAMERA = Camera(CAMERA_DEVICE)


def _placeholder_jpeg(text: str) -> bytes:
    try:
        import cv2
        import numpy as np
        img = np.full((240, 640, 3), 32, dtype=np.uint8)
        cv2.putText(img, text, (20, 130), cv2.FONT_HERSHEY_SIMPLEX,
                    0.7, (220, 220, 220), 2)
        ok, buf = cv2.imencode(".jpg", img)
        return buf.tobytes() if ok else b""
    except Exception:
        return b""


async def _mjpeg() -> Any:
    boundary = b"--frame"
    while True:
        frame = await CAMERA.wait_new(timeout=1.0)
        if frame is None:
            frame = _placeholder_jpeg(CAMERA.error or "waiting for camera...")
            if not frame:
                await asyncio.sleep(0.1); continue
        yield boundary + b"\r\nContent-Type: image/jpeg\r\nContent-Length: " \
              + str(len(frame)).encode() + b"\r\n\r\n" + frame + b"\r\n"


# ---------- App ----------

def _validate_waypoints(raw: list) -> list[tuple[float, float, float]]:
    """Return [(lat, lon, rel_alt_m), ...] or raise HTTPException(400)."""
    if not isinstance(raw, list) or not raw:
        raise HTTPException(status_code=400, detail="waypoints must be a non-empty list")
    out: list[tuple[float, float, float]] = []
    for i, wp in enumerate(raw):
        try:
            lat, lon, alt = float(wp[0]), float(wp[1]), float(wp[2])
        except Exception:
            raise HTTPException(status_code=400, detail=f"waypoint {i}: need [lat, lon, alt_m]")
        if not -90 <= lat <= 90 or not -180 <= lon <= 180:
            raise HTTPException(status_code=400, detail=f"waypoint {i}: lat/lon out of range")
        if not 0 < alt <= 120:
            raise HTTPException(status_code=400, detail=f"waypoint {i}: alt must be in (0, 120] m")
        out.append((lat, lon, alt))
    return out


def _build_mission_plan(wps: list[tuple[float, float, float]], speed_mps: float) -> MissionPlan:
    items: list[MissionItem] = []
    for lat, lon, alt in wps:
        items.append(MissionItem(
            latitude_deg=lat, longitude_deg=lon, relative_altitude_m=alt,
            speed_m_s=speed_mps, is_fly_through=True,
            gimbal_pitch_deg=float("nan"), gimbal_yaw_deg=float("nan"),
            camera_action=MissionItem.CameraAction.NONE,
            loiter_time_s=float("nan"),
            camera_photo_interval_s=float("nan"),
            acceptance_radius_m=2.0, yaw_deg=float("nan"),
            camera_photo_distance_m=float("nan"),
            vehicle_action=MissionItem.VehicleAction.NONE,
        ))
    return MissionPlan(items)


def make_app(conn: str) -> FastAPI:
    app = FastAPI(title="Drone Dashboard")
    # Middleware order: the LAST add_middleware call is the OUTERMOST. We want
    # SessionMiddleware to run before the auth gate, and CORS to wrap both.
    # So: add AuthGate first, then SessionMiddleware, then CORS last.
    app.add_middleware(AuthGateMiddleware)
    app.add_middleware(
        SessionMiddleware,
        secret_key=SESSION_SECRET,
        session_cookie="drone_session",
        same_site="lax",
        https_only=False,  # set true behind HTTPS reverse proxy
        max_age=60 * 60 * 8,  # 8h
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    drone = System()

    @app.get("/login", response_class=HTMLResponse)
    async def login_form(request: Request) -> HTMLResponse:
        if _is_authed(request):
            return RedirectResponse(url="/", status_code=303)  # type: ignore[return-value]
        return _render_login()

    @app.post("/login")
    async def login_submit(
        request: Request,
        username: str = Form(...),
        password: str = Form(...),
    ):
        if not _check_credentials(username, password):
            # small delay to blunt brute force
            await asyncio.sleep(0.5)
            return _render_login("Invalid username or password.", status=401)
        request.session["user"] = username
        return RedirectResponse(url="/", status_code=303)

    @app.get("/logout")
    async def logout(request: Request) -> RedirectResponse:
        request.session.clear()
        return RedirectResponse(url="/login", status_code=303)

    @app.on_event("startup")
    async def _startup() -> None:
        logging.basicConfig(level=logging.INFO)
        log.info("connecting to %s", conn)

        # Run the autopilot connect in the background so the HTTP server can
        # bind immediately even if no PX4 is listening yet. Pumps subscribe
        # via the MAVSDK stubs; they will just wait for the first message.
        async def _bring_up() -> None:
            try:
                await drone.connect(system_address=conn)
            except Exception as e:
                log.error("drone.connect failed: %s", e)
                return
            async for s in drone.core.connection_state():
                if s.is_connected:
                    log.info("autopilot connected")
                    asyncio.create_task(_collect_info(drone))
                    return

        asyncio.create_task(_bring_up())

        for pump in (_pump_connection, _pump_armed, _pump_in_air,
                     _pump_flight_mode, _pump_landed_state, _pump_battery,
                     _pump_gps, _pump_position, _pump_attitude,
                     _pump_vfr, _pump_heading, _pump_health):
            asyncio.create_task(_guard(pump, drone, pump.__name__))
        asyncio.create_task(_broadcaster())
        CAMERA.start()

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        CAMERA.stop()

    @app.get("/api/info")
    async def api_info() -> JSONResponse:
        return JSONResponse({"connection": conn, **INFO})

    @app.get("/api/state")
    async def api_state() -> JSONResponse:
        return JSONResponse({
            **asdict(STATE),
            "track": TRACK[-200:],
            "mission_count": len(MISSION["waypoints"]),
        })

    @app.get("/api/mission")
    async def api_mission_get() -> JSONResponse:
        return JSONResponse(MISSION)

    @app.post("/api/mission")
    async def api_mission_post(body: dict = Body(...)) -> JSONResponse:
        wps_raw = body.get("waypoints") or []
        speed = float(body.get("speed_mps", 5.0))
        wps = _validate_waypoints(wps_raw)
        try:
            plan = _build_mission_plan(wps, speed)
            await drone.mission.set_return_to_launch_after_mission(
                bool(body.get("rtl_after", True))
            )
            await drone.mission.upload_mission(plan)
        except MissionError as e:
            raise HTTPException(status_code=400, detail=f"upload failed: {e}")
        MISSION["waypoints"] = wps
        MISSION["speed_mps"] = speed
        MISSION["uploaded_at"] = time.time()
        return JSONResponse({"ok": True, "count": len(wps)})

    @app.post("/api/mission/clear")
    async def api_mission_clear() -> JSONResponse:
        try:
            await drone.mission.clear_mission()
        except MissionError as e:
            raise HTTPException(status_code=400, detail=str(e))
        MISSION["waypoints"] = []
        MISSION["uploaded_at"] = 0.0
        return JSONResponse({"ok": True})

    # ---- Action commands ----
    async def _safe_action(coro, label: str):
        try:
            await coro
        except ActionError as e:
            raise HTTPException(status_code=400, detail=f"{label}: {e}")
        except MissionError as e:
            raise HTTPException(status_code=400, detail=f"{label}: {e}")
        return JSONResponse({"ok": True, "action": label})

    @app.post("/api/cmd/arm")
    async def cmd_arm():       return await _safe_action(drone.action.arm(), "arm")

    @app.post("/api/cmd/disarm")
    async def cmd_disarm():    return await _safe_action(drone.action.disarm(), "disarm")

    @app.post("/api/cmd/takeoff")
    async def cmd_takeoff(body: dict = Body(default={})):
        alt = float(body.get("alt_m", 5.0))
        await drone.action.set_takeoff_altitude(alt)
        return await _safe_action(drone.action.takeoff(), f"takeoff@{alt}m")

    @app.post("/api/cmd/land")
    async def cmd_land():      return await _safe_action(drone.action.land(), "land")

    @app.post("/api/cmd/rtl")
    async def cmd_rtl():       return await _safe_action(drone.action.return_to_launch(), "rtl")

    @app.post("/api/cmd/hold")
    async def cmd_hold():      return await _safe_action(drone.action.hold(), "hold")

    @app.post("/api/cmd/start_mission")
    async def cmd_start():     return await _safe_action(drone.mission.start_mission(), "start_mission")

    @app.post("/api/cmd/pause_mission")
    async def cmd_pause():     return await _safe_action(drone.mission.pause_mission(), "pause_mission")

    @app.post("/api/cmd/track/clear")
    async def cmd_track_clear():
        TRACK.clear()
        return JSONResponse({"ok": True})

    @app.websocket("/ws/telemetry")
    async def ws_telemetry(ws: WebSocket) -> None:
        token = ws.query_params.get("token")
        if not ws.session.get("user") and not (token and hmac.compare_digest(token.encode("utf-8"), API_TOKEN.encode("utf-8"))):
            await ws.close(code=4401)
            return
        await ws.accept()
        CLIENTS.add(ws)
        try:
            while True:
                # Just keep the socket alive; broadcaster handles sending.
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            CLIENTS.discard(ws)

    @app.get("/video")
    async def video() -> StreamingResponse:
        return StreamingResponse(
            _mjpeg(),
            media_type="multipart/x-mixed-replace; boundary=frame",
        )

    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
    return app


async def _guard(coro_fn, drone: System, name: str) -> None:
    """Run a telemetry pump forever; log + retry on errors."""
    while True:
        try:
            await coro_fn(drone)
        except Exception as e:
            log.warning("pump %s died: %s; restarting in 2s", name, e)
            await asyncio.sleep(2)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--conn", default=os.environ.get("DRONE_CONN", "udpin://0.0.0.0:14540"),
                   help="MAVSDK system address (udpin://0.0.0.0:14540 for SITL, "
                        "serial:///dev/ttyACM0:115200 for USB Pixhawk). "
                        "Overrides $DRONE_CONN.")
    p.add_argument("--host", default=os.environ.get("DASHBOARD_HOST", "0.0.0.0"))
    p.add_argument("--port", type=int, default=int(os.environ.get("DASHBOARD_PORT", "8000")))
    args = p.parse_args()
    log.info("api token ready (set DASHBOARD_API_TOKEN to override)")

    import uvicorn
    uvicorn.run(make_app(args.conn), host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
