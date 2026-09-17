import type { Metadata } from "next";
import { RepairCoach } from "./RepairCoach";

export const metadata: Metadata = {
  title: "Fix My Weaknesses | SukuuNova Learn",
  description: "Turn your SukuuNova Learn mastery evidence into a targeted, adaptive repair session.",
};

export default function RepairPage() {
  return <RepairCoach />;
}
