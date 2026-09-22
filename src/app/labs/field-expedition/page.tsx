import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FieldExpeditionPrototype } from "@/components/field-expedition-prototype";

export const metadata: Metadata = {
  title: "Field Expedition Prototype | Sukuunova",
  robots: { index: false, follow: false },
};

export default function FieldExpeditionPrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <FieldExpeditionPrototype />;
}
