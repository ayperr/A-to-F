import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Planner from "@/components/Planner";
import RouteList from "@/components/RouteList";
import { loadRoute } from "@/lib/detail";
import { getRoute, routes } from "@/lib/routes";

export function generateStaticParams() {
  return routes.map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: PageProps<"/route/[id]">): Promise<Metadata> {
  const r = getRoute((await params).id);
  return r
    ? { title: `${r.origin} to ${r.dest}: which side?`, description: `Left or right window from ${r.origin_city} to ${r.dest_city}.` }
    : { title: "Route not found" };
}

export default async function RoutePage({ params }: PageProps<"/route/[id]">) {
  const detail = loadRoute((await params).id);
  if (!detail) notFound();
  return (
    <>
      <Planner detail={detail} />
      <RouteList />
    </>
  );
}
