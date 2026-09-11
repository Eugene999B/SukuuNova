export type MarketSupportMode = "guided" | "supported" | "independent" | "challenge";

export function marketPatienceDurationMs(difficulty: number, speedScale: number, supportMode: MarketSupportMode) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeSpeed = Math.max(0.65, Math.min(1.45, speedScale));
  const supportFactor = supportMode === "guided" ? 1.3 : supportMode === "supported" ? 1.14 : supportMode === "challenge" ? 0.84 : 1;
  const duration = ((18500 - (safeDifficulty - 1) * 1450) * supportFactor) / safeSpeed;
  return Math.round(Math.max(7000, Math.min(22000, duration)));
}

export function marketQueueTrustLoss(queuePressure: number, hazardDensity: number, boss = false) {
  const pressure = Math.max(0, Math.min(100, queuePressure));
  if (pressure < 82) return 0;
  const hazard = Math.max(0.45, Math.min(1.55, hazardDensity));
  const loss = 3 + Math.ceil(((pressure - 82) / 18) * 5 * hazard) + (boss ? 2 : 0);
  return Math.max(3, Math.min(12, loss));
}

export function marketScanRecovery(queuePressure: number, hintStrength: 0 | 1 | 2) {
  const recovery = 22 + hintStrength * 7;
  return Math.max(0, Math.min(100, queuePressure) - recovery);
}

export function marketStockCost(basketSize: number, difficulty: number) {
  const size = Math.max(1, Math.min(4, Math.trunc(basketSize)));
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  return Math.max(2, Math.min(18, size * 2 + safeDifficulty));
}

export function marketTillReward(queuePressure: number, difficulty: number) {
  const pressure = Math.max(0, Math.min(100, queuePressure));
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const speedBonus = pressure <= 28 ? 5 : pressure <= 52 ? 3 : pressure <= 76 ? 1 : 0;
  return 4 + safeDifficulty + speedBonus;
}

export function marketComboGain(queuePressure: number) {
  const pressure = Math.max(0, Math.min(100, queuePressure));
  if (pressure <= 35) return 2;
  if (pressure <= 70) return 1;
  return 0;
}

export function marketRestockGain(queuePressure: number) {
  const pressure = Math.max(0, Math.min(100, queuePressure));
  return pressure <= 45 ? 2 : pressure <= 75 ? 1 : 0;
}
