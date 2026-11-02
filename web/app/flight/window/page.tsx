import type { Metadata } from "next";
import FlightPage from "@/components/FlightPage";

export const metadata: Metadata = { title: "Virtual Window" };

export default function Page() {
  return <FlightPage view="window" />;
}
