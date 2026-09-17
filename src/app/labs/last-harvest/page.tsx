import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LastHarvestPrototype } from "@/components/last-harvest-prototype";

export const metadata: Metadata = {
  title: "The Last Harvest Prototype | Sukuunova",
  robots: { index: false, follow: false },
};

export default function LastHarvestPrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <LastHarvestPrototype />;
}
