import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NovaRunPrototype } from "@/components/nova-run-prototype";

export const metadata: Metadata = {
  title: "Nova Run Prototype | Sukuunova",
  robots: { index: false, follow: false },
};

export default function NovaRunPrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <NovaRunPrototype />;
}
