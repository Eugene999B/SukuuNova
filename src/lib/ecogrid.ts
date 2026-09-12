type SupportMode = "guided" | "supported" | "independent" | "challenge";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Ambient event pacing only; elapsed thinking time has no gameplay consequence. */
export function ecoEventDurationMs(difficulty: number, speedScale: number, supportMode: SupportMode) {
  const supportBonus = supportMode === "guided" ? 5000 : supportMode === "supported" ? 2800 : supportMode === "challenge" ? -1800 : 0;
  const base = 19500 - clamp(difficulty, 1, 5) * 1500 + supportBonus;
  return Math.round(clamp(base / clamp(speedScale, 0.65, 1.6), 8000, 24000));
}

export function ecoStressDamage(_pressure: number, _hazardDensity: number, _boss: boolean) {
  // Environmental systems respond to learner decisions, never to how long a child thinks.
  return 0;
}

export function ecoSurveyRecovery(pressure: number, hintStrength: 0 | 1 | 2) {
  const recovery = 18 + hintStrength * 7;
  return clamp(Math.round(clamp(pressure, 0, 100) - recovery), 0, 100);
}

export function ecoResilienceReward(_pressure: number, difficulty: number) {
  return clamp(3 + Math.floor(clamp(difficulty, 1, 5) / 2), 3, 6);
}

export function ecoSeedReward(riskLevel: number, _pressure: number) {
  return clamp(Math.round(clamp(riskLevel, 1, 5)) + 1, 2, 6);
}

export function ecoChainGain(_pressure: number) {
  return 1;
}

export function ecoResourceGain(riskLevel: number, _pressure: number) {
  const risk = clamp(Math.round(riskLevel), 1, 5);
  return clamp(risk + 2, 3, 7);
}
