export type NumberBloomSupportMode = "guided" | "supported" | "independent" | "challenge";

export function numberBloomMaxNumber(difficulty: number) {
  const level = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  return [3, 5, 6, 8, 10][level - 1] ?? 3;
}

export function numberBloomHintTokens(difficulty: number, supportMode: NumberBloomSupportMode = "independent") {
  const level = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const support = supportMode === "guided" ? 2 : supportMode === "supported" ? 1 : supportMode === "challenge" ? -1 : 0;
  return Math.max(1, Math.min(5, 4 - Math.floor(level / 2) + support));
}

export function numberBloomPetalReward(difficulty: number, revisions: number) {
  const level = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const carefulBonus = revisions <= 1 ? 2 : revisions === 2 ? 1 : 0;
  return Math.max(2, Math.min(9, 2 + level + carefulBonus));
}

export function numberBloomGrowthStage(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(5, Math.floor((Math.max(0, completed) / total) * 5)));
}

export function numberBloomFreeGrowNext(current: number, max = 10) {
  const cap = Math.max(1, Math.min(10, Math.trunc(max)));
  return current >= cap ? 0 : current + 1;
}
