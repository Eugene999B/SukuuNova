import type { Metadata } from "next";
import { StudyPlanDashboard } from "./StudyPlanDashboard";

export const metadata: Metadata = {
  title: "Study Plan | SukuuNova Learn",
  description: "A seven-day evidence-driven learning plan with spaced practice, recovery, and mastery-aware recommendations.",
};

export default function StudyPlanPage() {
  return <StudyPlanDashboard />;
}
