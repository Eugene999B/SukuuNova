import type { Metadata } from "next";
import { ConfidenceLab } from "./ConfidenceLab";

export const metadata: Metadata = {
  title: "Confidence Check | SukuuNova Learn",
  description: "Calibrate learning confidence by comparing certainty with outcomes before feedback.",
};

export default function ConfidencePage() {
  return <ConfidenceLab />;
}
