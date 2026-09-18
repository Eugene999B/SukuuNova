import type { Metadata } from "next";
import { InteractionLab } from "./InteractionLab";

export const metadata: Metadata = {
  title: "Interaction Lab | SukuuNova Learn",
  description: "Practice matching and ordering questions with explanation-first feedback in SukuuNova Learn.",
};

export default function InteractionLabPage() {
  return <InteractionLab />;
}
