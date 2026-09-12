export type MarketSupportMode = "guided" | "supported" | "independent" | "challenge";

/** Ambient queue animation only; careful money maths is never punished. */
export function marketPatienceDurationMs(difficulty: number, speedScale: number, supportMode: MarketSupportMode) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeSpeed = Math.max(0.65, Math.min(1.45, speedScale));
  const supportFactor = supportMode === "guided" ? 1.3 : supportMode === "supported" ? 1.14 : supportMode === "challenge" ? 0.84 : 1;
  const duration = ((18500 - (safeDifficulty - 1) * 1450) * supportFactor) / safeSpeed;
  return Math.round(Math.max(7000, Math.min(22000, duration)));
}

export function marketQueueTrustLoss(_queuePressure: number, _hazardDensity: number, _boss = false) {
  return 0;
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

export function marketTillReward(_queuePressure: number, difficulty: number) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  return 7 + safeDifficulty;
}

export function marketComboGain(_queuePressure: number) {
  return 1;
}

export function marketRestockGain(_queuePressure: number) {
  return 1;
}
