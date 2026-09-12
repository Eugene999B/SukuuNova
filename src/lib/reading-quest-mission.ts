export type ReadingRoute = "river-trail" | "market-archive" | "hill-lookout";

const ROUTES: readonly ReadingRoute[] = ["river-trail", "market-archive", "hill-lookout"];

export function readingQuestRouteForChoice(checkpoint: number, choice: number): ReadingRoute {
  const safeCheckpoint = Math.max(0, Math.trunc(checkpoint));
  const safeChoice = Math.max(0, Math.min(2, Math.trunc(choice)));
  return ROUTES[(safeCheckpoint + safeChoice) % ROUTES.length] ?? "river-trail";
}

/** Ambient expedition pacing only. It must never grade reading speed or damage progress. */
export function readingQuestFogDurationMs(difficulty: number, speedScale: number, supportMode: "guided" | "supported" | "independent" | "challenge") {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeSpeed = Math.max(0.65, Math.min(1.45, speedScale));
  const support = supportMode === "guided" ? 1.22 : supportMode === "supported" ? 1.12 : supportMode === "challenge" ? 0.9 : 1;
  return Math.round(Math.max(5600, Math.min(16000, ((14500 - safeDifficulty * 900) * support) / safeSpeed)));
}

export function readingQuestTrailDamage(_fog: number, _hazardDensity: number, _boss: boolean) {
  // Reading carefully is never a failure state. Fog is presentation, not punishment.
  return 0;
}

export function readingQuestLanternReward(_fog: number) {
  // Reward the completed evidence step consistently; do not reward rushing a passage.
  return 1;
}

export function readingQuestFocusRecovery(fog: number) {
  return Math.max(0, Math.min(100, fog) - 34);
}

export function readingQuestRouteLabel(route: ReadingRoute) {
  if (route === "market-archive") return "Market Archive";
  if (route === "hill-lookout") return "Hill Lookout";
  return "River Trail";
}
