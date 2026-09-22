import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FailurePointPrototype } from "@/components/failure-point-prototype";

export const metadata: Metadata = {
  title: "Failure Point Prototype | Sukuunova",
  robots: { index: false, follow: false },
};

export default function FailurePointPrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <FailurePointPrototype />;
}
