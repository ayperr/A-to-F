// Static data written by pipeline/build_data.py. Bundled at build time: no runtime I/O, $0 per visit.
import index from "@/public/data/routes.json";

export type Side = "A" | "F" | null;
export type Rule = "golden" | "shade" | "neutral" | "dark";

export interface SlotSummary {
  slot: string;
  departure_local: string;
  duration_min: number;
  side: Side;
  rule: Rule;
  reason: string;
  golden_minutes: { A: number; F: number };
  daylight_minutes: { A: number; F: number };
}

export interface RouteSummary {
  id: string;
  origin: string;
  dest: string;
  origin_city: string;
  dest_city: string;
  verified: boolean;
  source: string;
  distance_km: number;
  date: string;
  track_source: string;
  slots: SlotSummary[];
}

export const routes = index.routes as RouteSummary[];
export const generatedFor = index.generated_for;

export function getRoute(id: string): RouteSummary | undefined {
  return routes.find((r) => r.id === id);
}

export function sideLabel(side: Side): string {
  return side === "A" ? "Left · A" : side === "F" ? "Right · F" : "Either side";
}

export function localTime(iso: string): string {
  // "2026-11-12T15:00:00-05:00" -> "15:00" (origin local time, as written by the pipeline)
  return iso.slice(11, 16);
}

export const RULE_LABEL: Record<Rule, string> = {
  golden: "Sunset / sunrise",
  shade: "Shade side",
  neutral: "Sun ahead or behind",
  dark: "After dark",
};
