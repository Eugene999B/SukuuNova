import type { Metadata } from "next";
import { ProgressDashboard } from "./ProgressDashboard";

export const metadata: Metadata = {
  title: "Progress & Mastery | SukuuNova Learn",
  description: "See your local SukuuNova Learn practice accuracy, mastery evidence, repair priorities and next practice recommendation.",
};

export default function LearnProgressPage() {
  return <ProgressDashboard />;
}
