import type { Metadata } from "next";
import { LearningExplorer } from "./LearningExplorer";

export const metadata: Metadata = {
  title: "Explore | SukuuNova Learn",
  description: "Build intelligent learning sessions by curriculum, level, subject, topic and practice mode.",
};

export default function LearnExplorePage() {
  return <LearningExplorer />;
}
