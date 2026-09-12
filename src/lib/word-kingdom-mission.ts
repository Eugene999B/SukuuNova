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

/** Ambient shadow motion only; reading and language reasoning are never speed-scored. */
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

export function wordKingdomGateDamage(_threatPercent: number, _hazardDensity = 1, _boss = false) {
  return 0;
}

export function wordKingdomManaReward(_threatPercent: number, focusChain: number) {
  const chain = focusChain >= 3 ? 1 : 0;
  return Math.min(3, 1 + chain);
}

export function wordKingdomFocusChain(previous: number, _threatPercent: number) {
  return Math.min(9, Math.max(0, previous) + 1);
}

export function wordKingdomWardRecovery(integrity: number, threatPercent: number) {
  return {
    integrity: Math.min(100, Math.max(0, integrity) + 8),
    threat: Math.max(0, Math.min(100, threatPercent) - 32),
  };
}
