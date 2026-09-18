import type { Metadata } from "next";
import { PracticeEngine } from "./PracticeEngine";

export const metadata: Metadata = {
  title: "Practice | SukuuNova Learn",
  description:
    "Build an exposure-aware SukuuNova Learn practice session with instant scoring, explanations and local mastery signals.",
};

export default function LearnPracticePage() {
  return <PracticeEngine />;
}
