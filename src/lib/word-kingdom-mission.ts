export type WordKingdomRegion = "whispering-woods" | "lexicon-forge" | "grammar-keep" | "crown-citadel";
export type WordKingdomSupportMode = "guided" | "supported" | "independent" | "challenge";

const SUPPORT_TIME_SCALE: Record<WordKingdomSupportMode, number> = {
  guided: 1.28,
  supported: 1.14,
  independent: 1,
  challenge: 0.9,
};

export function wordKingdomRegionForCheckpoint(checkpoint: number, boss = false): WordKingdomRegion {
  if (boss) return "crown-citadel";
  const regions: WordKingdomRegion[] = ["whispering-woods", "lexicon-forge", "grammar-keep"];
  return regions[Math.abs(checkpoint) % regions.length] ?? "whispering-woods";
}

export function wordKingdomThreatDurationMs(
  difficulty: number,
  speedScale = 1,
  supportMode: WordKingdomSupportMode = "independent",
) {
  const boundedDifficulty = Math.min(5, Math.max(1, Math.round(difficulty)));
  const boundedSpeed = Math.min(1.5, Math.max(0.7, speedScale));
  const base = 11200 - (boundedDifficulty - 1) * 900;
  return Math.round(Math.min(15000, Math.max(4600, (base * SUPPORT_TIME_SCALE[supportMode]) / boundedSpeed)));
}

export function wordKingdomGateDamage(threatPercent: number, hazardDensity = 1, boss = false) {
  const threat = Math.min(100, Math.max(0, threatPercent));
  const hazard = Math.min(1.6, Math.max(0.5, hazardDensity));
  const pressure = 3 + Math.floor(threat / 22) + Math.round((hazard - 0.5) * 4) + (boss ? 3 : 0);
  return Math.min(16, Math.max(3, pressure));
}

export function wordKingdomManaReward(threatPercent: number, focusChain: number) {
  const threat = Math.min(100, Math.max(0, threatPercent));
  const quick = threat <= 45 ? 2 : threat <= 75 ? 1 : 0;
  const chain = focusChain >= 3 ? 1 : 0;
  return Math.min(3, quick + chain);
}

export function wordKingdomFocusChain(previous: number, threatPercent: number) {
  return threatPercent <= 65 ? Math.min(9, Math.max(0, previous) + 1) : 0;
}

export function wordKingdomWardRecovery(integrity: number, threatPercent: number) {
  return {
    integrity: Math.min(100, Math.max(0, integrity) + 8),
    threat: Math.max(0, Math.min(100, threatPercent) - 32),
  };
}
