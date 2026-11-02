import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Postcard from "@/components/Postcard";
import { loadRoute } from "@/lib/detail";
import { getRoute, routes } from "@/lib/routes";

export function generateStaticParams() {
  return routes.map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: PageProps<"/postcard/[id]">): Promise<Metadata> {
  const r = getRoute((await params).id);
  return { title: r ? `Postcard, ${r.origin} to ${r.dest}` : "Postcard" };
}

export default async function PostcardPage({ params }: PageProps<"/postcard/[id]">) {
  const detail = loadRoute((await params).id);
  if (!detail) notFound();
  return <Postcard detail={detail} />;
}
