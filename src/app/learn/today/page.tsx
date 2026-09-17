import type { Metadata } from "next";
import { DailyChallenge } from "./DailyChallenge";

export const metadata: Metadata = {
  title: "Today's 10 | SukuuNova Learn",
  description: "A free daily ten-question SukuuNova Learn challenge that feeds your local mastery evidence.",
};

export default function TodayPage() {
  return <DailyChallenge />;
}
