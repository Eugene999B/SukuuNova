import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchivePrototype } from "@/components/archive-prototype";

export const metadata: Metadata = {
  title: "The Archive Prototype | Sukuunova",
  robots: { index: false, follow: false },
};

export default function ArchivePrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ArchivePrototype />;
}
