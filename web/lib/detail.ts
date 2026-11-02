import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
