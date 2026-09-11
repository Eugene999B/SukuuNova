export type ReadingRoute = "river-trail" | "market-archive" | "hill-lookout";

const ROUTES: readonly ReadingRoute[] = ["river-trail", "market-archive", "hill-lookout"];

export function readingQuestRouteForChoice(checkpoint: number, choice: number): ReadingRoute {
  const safeCheckpoint = Math.max(0, Math.trunc(checkpoint));
  const safeChoice = Math.max(0, Math.min(2, Math.trunc(choice)));
  return ROUTES[(safeCheckpoint + safeChoice) % ROUTES.length] ?? "river-trail";
}

export function readingQuestFogDurationMs(difficulty: number, speedScale: number, supportMode: "guided" | "supported" | "independent" | "challenge") {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeSpeed = Math.max(0.65, Math.min(1.45, speedScale));
  const support = supportMode === "guided" ? 1.22 : supportMode === "supported" ? 1.12 : supportMode === "challenge" ? 0.9 : 1;
  return Math.round(Math.max(5600, Math.min(16000, ((14500 - safeDifficulty * 900) * support) / safeSpeed)));
}

export function readingQuestTrailDamage(fog: number, hazardDensity: number, boss: boolean) {
  const safeFog = Math.max(0, Math.min(100, fog));
  const density = Math.max(0.5, Math.min(1.5, hazardDensity));
  const pressure = safeFog / 100;
  return Math.max(1, Math.min(14, Math.round(2 + pressure * 7 * density + (boss ? 3 : 0))));
}

export function readingQuestLanternReward(fog: number) {
  if (fog <= 34) return 2;
  if (fog <= 66) return 1;
  return 0;
}

export function readingQuestFocusRecovery(fog: number) {
  return Math.max(0, Math.min(100, fog) - 34);
}

export function readingQuestRouteLabel(route: ReadingRoute) {
  if (route === "market-archive") return "Market Archive";
  if (route === "hill-lookout") return "Hill Lookout";
  return "River Trail";
}
