import type { Metadata } from "next";
import { LearnExperience } from "./LearnExperience";

export const metadata: Metadata = {
  title: "SukuuNova Learn | Learn. Practice. Master.",
  description:
    "Free, intelligent practice for school, exams, university and skills — built to help every learner understand what to learn next.",
};

export default function LearnPage() {
  return <LearnExperience />;
}
