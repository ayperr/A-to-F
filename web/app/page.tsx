import Planner from "@/components/Planner";
import RouteList from "@/components/RouteList";
import ViewOfWeek from "@/components/ViewOfWeek";
import { loadRoute } from "@/lib/detail";

export default function Home() {
  const detail = loadRoute("jfk-lax")!;
  return (
    <>
      <Planner detail={detail} />
      <ViewOfWeek />
      <RouteList />
    </>
  );
}
