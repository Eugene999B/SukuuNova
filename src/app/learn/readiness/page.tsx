import type { Metadata } from "next";
import { ReadinessDashboard } from "./ReadinessDashboard";

export const metadata: Metadata = {
  title: "Learning Readiness | SukuuNova Learn",
  description: "A transparent, evidence-based profile for deciding when to move into harder SukuuNova practice.",
};

export default function ReadinessPage() {
  return <ReadinessDashboard />;
}
