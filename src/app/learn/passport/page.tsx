import type { Metadata } from "next";
import { LearningPassportPage } from "./LearningPassportPage";

export const metadata: Metadata = {
  title: "Learning Passport | SukuuNova Learn",
  description: "Export and restore versioned device-local SukuuNova learning evidence without creating an account.",
};

export default function PassportPage() {
  return <LearningPassportPage />;
}
