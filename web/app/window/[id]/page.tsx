import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VirtualWindow from "@/components/VirtualWindow";
import { loadRoute } from "@/lib/detail";
import { getRoute, routes } from "@/lib/routes";

export function generateStaticParams() {
  return routes.map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: PageProps<"/window/[id]">): Promise<Metadata> {
  const r = getRoute((await params).id);
  return { title: r ? `Virtual Window, ${r.origin} to ${r.dest}` : "Virtual Window" };
}

export default async function WindowPage({ params }: PageProps<"/window/[id]">) {
  const detail = loadRoute((await params).id);
  if (!detail) notFound();
  return <VirtualWindow detail={detail} />;
}
