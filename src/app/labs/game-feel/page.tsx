import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameMovementLab } from "@/components/game-movement-lab";

export const metadata: Metadata = {
  title: "Game Feel Lab | Sukuunova",
  robots: { index: false, follow: false },
};

export default function GameFeelLabPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GameMovementLab />;
}
