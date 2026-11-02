import index from "@/public/data/routes.json";
import type { RouteSummary } from "./engine/types";

export const routes = index.routes as RouteSummary[];

export const getRoute = (id: string) => routes.find((r) => r.id === id);

export const origins = [...new Set(routes.map((r) => r.origin))];

export const destinationsFrom = (origin: string) => routes.filter((r) => r.origin === origin).map((r) => r.dest);

export const routeId = (origin: string, dest: string) => `${origin.toLowerCase()}-${dest.toLowerCase()}`;

export function duration(min: number): string {
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}
