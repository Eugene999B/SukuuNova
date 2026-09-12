type SupportMode = "guided" | "supported" | "independent" | "challenge";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function bioCaseDurationMs(difficulty: number, speedScale: number, supportMode: SupportMode) {
  const supportBonus = supportMode === "guided" ? 5200 : supportMode === "supported" ? 3000 : supportMode === "challenge" ? -1800 : 0;
  const base = 20000 - clamp(difficulty, 1, 5) * 1450 + supportBonus;
  return Math.round(clamp(base / clamp(speedScale, 0.65, 1.6), 8200, 25000));
}

export function bioStrainDamage(pressure: number, hazardDensity: number, boss: boolean) {
  if (pressure < 50) return 0;
  const raw = 2 + Math.floor((clamp(pressure, 0, 100) - 50) / 14) + Math.round(clamp(hazardDensity, 0, 2) * 2) + (boss ? 2 : 0);
  return clamp(raw, 2, 12);
}

export function bioScanRecovery(pressure: number, hintStrength: 0 | 1 | 2) {
  return clamp(Math.round(clamp(pressure, 0, 100) - (18 + hintStrength * 7)), 0, 100);
}

export function bioVitalityReward(pressure: number, difficulty: number) {
  const pace = pressure <= 35 ? 4 : pressure <= 68 ? 2 : 1;
  return clamp(1 + pace + Math.floor(clamp(difficulty, 1, 5) / 2), 2, 8);
}

export function bioInsightReward(strainLevel: number, pressure: number) {
  const pace = pressure <= 42 ? 2 : pressure <= 72 ? 1 : 0;
  return clamp(Math.round(clamp(strainLevel, 1, 5)) + pace, 1, 7);
}

export function bioSystemGain(strainLevel: number, pressure: number) {
  const pace = pressure <= 40 ? 3 : pressure <= 72 ? 2 : 1;
  return clamp(Math.round(clamp(strainLevel, 1, 5)) + pace, 2, 8);
}

export function bioComboGain(pressure: number) {
  if (pressure <= 35) return 2;
  if (pressure <= 70) return 1;
  return 0;
}
