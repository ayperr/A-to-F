import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getRoute } from "@/lib/routes";
import ViewOfWeekList, { type Flight } from "./ViewOfWeekList";

type Week = { from: string; days: Record<string, Flight[]> };

// The best golden-light flights for each of the next 14 days (pipeline/view_of_week.py, rerun with each data
// batch). The browser picks the seven days after today, so a past day never shows.
export default function ViewOfWeek() {
  const p = join(process.cwd(), "public", "data", "view-of-week.json");
  if (!existsSync(p)) return null;
  const week: Week = JSON.parse(readFileSync(p, "utf8"));
  const flights = Object.values(week.days ?? {}).flat().map((f) => {
    const r = getRoute(f.route);
    return { ...f, origin_city: r?.origin_city ?? f.origin, dest_city: r?.dest_city ?? f.dest };
  });
  if (!flights.length) return null;
  return <ViewOfWeekList flights={flights} />;
}
