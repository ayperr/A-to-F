import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adhocDetail, withLandmarks } from "./adhoc";
import type { Catalog } from "./engine/landmarks";
import type { RouteDetail } from "./engine/types";

/** Read one route's track + landmarks at build time (pages are prerendered per route). */
export function loadRoute(id: string): RouteDetail | undefined {
  if (!/^[a-z]{3}-[a-z]{3}$/.test(id)) return undefined;
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "public", "data", "routes", `${id}.json`), "utf8"));
  } catch {
    return undefined;
  }
}

let catalog: Catalog | null = null;

/** The landmark catalogue, read from disk once per server instance. Throws if it is missing. */
function loadCatalogSync(): Catalog {
  catalog ??= JSON.parse(readFileSync(join(process.cwd(), "public", "data", "landmarks.json"), "utf8")) as Catalog;
  return catalog;
}

/** How many features the landmark catalogue holds (read at build time for the About page). */
export function catalogSize(): number {
  try {
    return loadCatalogSync().features.length;
  } catch {
    return 0;
  }
}

/** A mapped route from its file, or any other route rebuilt from the airports in the request (with the same
 *  landmark search the browser runs), so the Claude features can only use engine facts either way. */
export function resolveRoute(p: { route?: unknown; o?: unknown; x?: unknown }): RouteDetail | undefined {
  const mapped = loadRoute(String(p.route ?? ""));
  if (mapped) return mapped;
  if (typeof p.o !== "string" || typeof p.x !== "string") return undefined;
  const detail = adhocDetail(new URLSearchParams({ o: p.o, x: p.x }));
  if (!detail || detail.id !== String(p.route ?? "")) return undefined;
  try {
    return withLandmarks(detail, loadCatalogSync());
  } catch {
    return undefined;
  }
}
