type SupportMode = "guided" | "supported" | "independent" | "challenge";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Ambient case pacing only; the learner's reasoning time is never a biological penalty. */
export function bioCaseDurationMs(difficulty: number, speedScale: number, supportMode: SupportMode) {
  const supportBonus = supportMode === "guided" ? 5200 : supportMode === "supported" ? 3000 : supportMode === "challenge" ? -1800 : 0;
  const base = 20000 - clamp(difficulty, 1, 5) * 1450 + supportBonus;
  return Math.round(clamp(base / clamp(speedScale, 0.65, 1.6), 8200, 25000));
}

export function bioStrainDamage(_pressure: number, _hazardDensity: number, _boss: boolean) {
  // The training avatar changes because of biological decisions, never because a learner reads slowly.
  return 0;
}

export function bioScanRecovery(pressure: number, hintStrength: 0 | 1 | 2) {
  return clamp(Math.round(clamp(pressure, 0, 100) - (18 + hintStrength * 7)), 0, 100);
}

export function bioVitalityReward(_pressure: number, difficulty: number) {
  return clamp(3 + Math.floor(clamp(difficulty, 1, 5) / 2), 3, 6);
}

export function bioInsightReward(strainLevel: number, _pressure: number) {
  return clamp(Math.round(clamp(strainLevel, 1, 5)) + 1, 2, 6);
}

export function bioSystemGain(strainLevel: number, _pressure: number) {
  return clamp(Math.round(clamp(strainLevel, 1, 5)) + 2, 3, 7);
}

export function bioComboGain(_pressure: number) {
  return 1;
}
