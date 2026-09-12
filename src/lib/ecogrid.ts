type SupportMode = "guided" | "supported" | "independent" | "challenge";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function ecoEventDurationMs(difficulty: number, speedScale: number, supportMode: SupportMode) {
  const supportBonus = supportMode === "guided" ? 5000 : supportMode === "supported" ? 2800 : supportMode === "challenge" ? -1800 : 0;
  const base = 19500 - clamp(difficulty, 1, 5) * 1500 + supportBonus;
  return Math.round(clamp(base / clamp(speedScale, 0.65, 1.6), 8000, 24000));
}

export function ecoStressDamage(pressure: number, hazardDensity: number, boss: boolean) {
  if (pressure < 48) return 0;
  const raw = 2 + Math.floor((clamp(pressure, 0, 100) - 48) / 13) + Math.round(clamp(hazardDensity, 0, 2) * 2) + (boss ? 2 : 0);
  return clamp(raw, 2, 12);
}

export function ecoSurveyRecovery(pressure: number, hintStrength: 0 | 1 | 2) {
  const recovery = 18 + hintStrength * 7;
  return clamp(Math.round(clamp(pressure, 0, 100) - recovery), 0, 100);
}

export function ecoResilienceReward(pressure: number, difficulty: number) {
  const speedBonus = pressure <= 35 ? 4 : pressure <= 65 ? 2 : 1;
  return clamp(1 + speedBonus + Math.floor(clamp(difficulty, 1, 5) / 2), 2, 8);
}

export function ecoSeedReward(riskLevel: number, pressure: number) {
  const urgencyBonus = pressure <= 40 ? 2 : pressure <= 70 ? 1 : 0;
  return clamp(Math.round(clamp(riskLevel, 1, 5)) + urgencyBonus, 1, 7);
}

export function ecoChainGain(pressure: number) {
  if (pressure <= 35) return 2;
  if (pressure <= 70) return 1;
  return 0;
}

export function ecoResourceGain(riskLevel: number, pressure: number) {
  const risk = clamp(Math.round(riskLevel), 1, 5);
  const pace = pressure <= 40 ? 3 : pressure <= 72 ? 2 : 1;
  return clamp(risk + pace, 2, 8);
}
