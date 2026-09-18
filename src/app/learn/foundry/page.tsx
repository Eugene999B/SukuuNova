import type { Metadata } from "next";
import { FoundryConsole } from "./FoundryConsole";

export const metadata: Metadata = {
  title: "Question Foundry QA | SukuuNova Learn",
  description: "Review SukuuNova Learn question quality, provenance, verification checks and publishability.",
};

export default function FoundryPage() {
  return <FoundryConsole />;
}
