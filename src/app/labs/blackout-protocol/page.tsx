import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlackoutProtocolPrototype } from "@/components/blackout-protocol-prototype";

export const metadata: Metadata = {
  title: "Blackout Protocol Prototype | Sukuunova",
  robots: { index: false, follow: false },
};

export default function BlackoutProtocolPrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <BlackoutProtocolPrototype />;
}
