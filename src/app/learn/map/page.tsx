import type { Metadata } from "next";
import { MasteryMapDashboard } from "./MasteryMapDashboard";

export const metadata: Metadata = {
  title: "Mastery Map | SukuuNova Learn",
  description: "See practiced, unseen, developing, repair, evidence and secure topics across the current SukuuNova starter map.",
};

export default function MasteryMapPage() {
  return <MasteryMapDashboard />;
}
