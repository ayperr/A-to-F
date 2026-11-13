export type Side = "A" | "F" | null;
export type Rule = "golden" | "landmarks" | "shade" | "neutral" | "dark";

/** [lat, lon, altitude m, heading deg] — one row per minute after takeoff. */
export type TrackRow = [number, number, number, number];

export interface Airport {
  iata: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  tz: string;
}

export interface Landmark {
  name: string;
  kind: string;
  wikidata: string;
  source: string;
  minute: number;
  side: "A" | "F" | "below";
  dist_km: number;
  confidence: "high" | "low";
  needs_daylight: boolean;
  score: number;
  lat: number;
  lon: number;
}

export interface RouteDetail {
  id: string;
  core?: boolean;
  origin: Airport;
  dest: Airport;
  verified: boolean;
  source: string;
  distance_km: number;
  duration_min: number;
  track_source: string;
  track: TrackRow[];
  landmarks: Landmark[];
}

export interface RouteSummary {
  id: string;
  core?: boolean;   // one of the 20 core directions (Insights, engine fixtures); others are observed routes
  origin: string;
  dest: string;
  origin_city: string;
  dest_city: string;
  origin_tz: string;
  verified: boolean;
  source: string;
  distance_km: number;
  duration_min: number;
  landmark_count: number;
  track_source: string;
}

export interface SunSample {
  minute: number;
  az: number;
  el: number;
  rel: number;
  side: "A" | "F" | "-";
  glowSide: "A" | "F" | "-";
  visible: boolean;
  golden: boolean;
}

export interface Recommendation {
  side: Side;
  rule: Rule;
  reason: string;
  golden_start_min?: number;
  golden_minutes: { A: number; F: number };
  daylight_minutes: { A: number; F: number };
  landmark_weight: { A: number; F: number };
}
