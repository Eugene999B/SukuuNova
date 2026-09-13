import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GeometryForgePrototype } from "@/components/geometry-forge-prototype";

export const metadata: Metadata = {
  title: "Geometry Forge Prototype | Sukuunova",
  robots: { index: false, follow: false },
};

export default function GeometryForgePrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GeometryForgePrototype />;
}
