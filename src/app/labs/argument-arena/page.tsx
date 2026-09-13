import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArgumentArenaPrototype } from "@/components/argument-arena-prototype";

export const metadata: Metadata = {
  title: "Argument Arena Prototype | Sukuunova",
  robots: { index: false, follow: false },
};

export default function ArgumentArenaPrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ArgumentArenaPrototype />;
}
