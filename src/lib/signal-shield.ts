export type SignalSupportMode = "guided" | "supported" | "independent" | "challenge";

export function signalIncidentDurationMs(difficulty: number, speedScale: number, supportMode: SignalSupportMode) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeSpeed = Math.max(0.65, Math.min(1.45, speedScale));
  const supportFactor = supportMode === "guided" ? 1.3 : supportMode === "supported" ? 1.15 : supportMode === "challenge" ? 0.82 : 1;
  const duration = ((20500 - (safeDifficulty - 1) * 1550) * supportFactor) / safeSpeed;
  return Math.round(Math.max(7600, Math.min(24500, duration)));
}

export function signalBreachDamage(threatPressure: number, hazardDensity: number, boss = false) {
  const pressure = Math.max(0, Math.min(100, threatPressure));
  if (pressure < 84) return 0;
  const hazard = Math.max(0.45, Math.min(1.55, hazardDensity));
  const damage = 4 + Math.ceil(((pressure - 84) / 16) * 6 * hazard) + (boss ? 3 : 0);
  return Math.max(4, Math.min(15, damage));
}

export function signalScannerRecovery(threatPressure: number, hintStrength: 0 | 1 | 2) {
  const recovery = 24 + hintStrength * 8;
  return Math.max(0, Math.min(100, threatPressure) - recovery);
}

export function signalIntegrityReward(threatPressure: number, difficulty: number) {
  const pressure = Math.max(0, Math.min(100, threatPressure));
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const speedBonus = pressure <= 30 ? 4 : pressure <= 58 ? 2 : 0;
  return Math.max(2, Math.min(10, 2 + Math.ceil(safeDifficulty / 2) + speedBonus));
}

export function signalIntelReward(threatLevel: number, threatPressure: number) {
  const level = Math.max(1, Math.min(5, Math.trunc(threatLevel)));
  const pressure = Math.max(0, Math.min(100, threatPressure));
  const calmBonus = pressure <= 45 ? 2 : pressure <= 72 ? 1 : 0;
  return Math.max(1, Math.min(9, level + calmBonus));
}

export function signalChainGain(threatPressure: number) {
  const pressure = Math.max(0, Math.min(100, threatPressure));
  if (pressure <= 34) return 2;
  if (pressure <= 72) return 1;
  return 0;
}

export function signalQuarantineCost(threatLevel: number, difficulty: number) {
  const level = Math.max(1, Math.min(5, Math.trunc(threatLevel)));
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  return Math.max(2, Math.min(14, level + Math.ceil(safeDifficulty / 2)));
}
