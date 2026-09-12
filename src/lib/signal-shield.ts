export type SignalSupportMode = "guided" | "supported" | "independent" | "challenge";

/** Ambient incident pulse only; defensive reasoning is not a speed test. */
export function signalIncidentDurationMs(difficulty: number, speedScale: number, supportMode: SignalSupportMode) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeSpeed = Math.max(0.65, Math.min(1.45, speedScale));
  const supportFactor = supportMode === "guided" ? 1.3 : supportMode === "supported" ? 1.15 : supportMode === "challenge" ? 0.82 : 1;
  const duration = ((20500 - (safeDifficulty - 1) * 1550) * supportFactor) / safeSpeed;
  return Math.round(Math.max(7600, Math.min(24500, duration)));
}

export function signalBreachDamage(_threatPressure: number, _hazardDensity: number, _boss = false) {
  return 0;
}

export function signalScannerRecovery(threatPressure: number, hintStrength: 0 | 1 | 2) {
  const recovery = 24 + hintStrength * 8;
  return Math.max(0, Math.min(100, threatPressure) - recovery);
}

export function signalIntegrityReward(_threatPressure: number, difficulty: number) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  return Math.max(3, Math.min(7, 3 + Math.ceil(safeDifficulty / 2)));
}

export function signalIntelReward(threatLevel: number, _threatPressure: number) {
  const level = Math.max(1, Math.min(5, Math.trunc(threatLevel)));
  return Math.max(2, Math.min(6, level + 1));
}

export function signalChainGain(_threatPressure: number) {
  return 1;
}

export function signalQuarantineCost(threatLevel: number, difficulty: number) {
  const level = Math.max(1, Math.min(5, Math.trunc(threatLevel)));
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  return Math.max(2, Math.min(14, level + Math.ceil(safeDifficulty / 2)));
}
