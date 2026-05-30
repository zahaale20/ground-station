// Telemetry shapes mirror the JSON the drone backend broadcasts on
// /ws/telemetry. Keep these aligned with dataclasses.asdict(STATE) in
// drone/dashboard/server.py.

export interface Health {
  gyro?: boolean;
  accel?: boolean;
  mag?: boolean;
  local_pos?: boolean;
  global_pos?: boolean;
  home?: boolean;
  armable?: boolean;
  [key: string]: boolean | undefined;
}

export interface Telemetry {
  connected: boolean;
  armed: boolean;
  in_air: boolean;
  flight_mode: string;
  landed_state: string;
  battery_v: number;
  battery_pct: number;
  gps_fix: string;
  gps_sats: number;
  lat: number;
  lon: number;
  abs_alt_m: number;
  rel_alt_m: number;
  ground_speed_mps: number;
  heading_deg: number;
  roll_deg: number;
  pitch_deg: number;
  yaw_deg: number;
  health: Health;
  home_set: boolean;
  armable: boolean;
  last_update: number;
  track: [number, number, number][];
  mission_count: number;
}

export interface DroneInfo {
  connection?: string;
  ready?: boolean;
  vendor?: string;
  product?: string;
  flight_sw?: string;
  os_sw?: string;
  flight_sw_git?: string;
  hardware_uid?: string;
  params?: Record<string, number | null>;
}

export type Waypoint = [number, number, number]; // [lat, lon, alt_m]

export interface MissionState {
  waypoints: Waypoint[];
  speed_mps: number;
  uploaded_at: number;
}
