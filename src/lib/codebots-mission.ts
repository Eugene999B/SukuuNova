export type CodeBotsSupportMode = "guided" | "supported" | "independent" | "challenge";
export type CodeBotsZone = "assembly-bay" | "sensor-grid" | "loop-reactor" | "logic-core";

export function codeBotsFactoryZoneForCheckpoint(checkpoint: number, boss = false): CodeBotsZone {
  if (boss) return "logic-core";
  return (["assembly-bay", "sensor-grid", "loop-reactor"] as const)[Math.abs(Math.trunc(checkpoint)) % 3];
}

export function codeBotsZoneLabel(zone: CodeBotsZone) {
  if (zone === "assembly-bay") return "Assembly Bay";
  if (zone === "sensor-grid") return "Sensor Grid";
  if (zone === "loop-reactor") return "Loop Reactor";
  return "Logic Core";
}

/** Conveyor motion is visual feedback only; programming time is not graded. */
export function codeBotsCycleDurationMs(difficulty: number, speedScale: number, supportMode: CodeBotsSupportMode) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeSpeed = Math.max(0.65, Math.min(1.45, speedScale));
  const supportFactor = supportMode === "guided" ? 1.22 : supportMode === "supported" ? 1.1 : supportMode === "challenge" ? 0.86 : 1;
  const duration = ((15400 - (safeDifficulty - 1) * 1350) * supportFactor) / safeSpeed;
  return Math.round(Math.max(6200, Math.min(18500, duration)));
}

export function codeBotsOverheatDamage(_heat: number, _hazardDensity: number, _boss = false) {
  return 0;
}

export function codeBotsPowerReward(_heat: number, commandCount: number) {
  const sizeBonus = Math.max(0, Math.min(2, Math.floor(Math.max(0, commandCount - 3) / 2)));
  return Math.min(4, 2 + sizeBonus);
}

export function codeBotsEfficiencyChain(current: number, _heat: number) {
  return Math.min(9, Math.max(0, Math.trunc(current)) + 1);
}

export function codeBotsDebugRecovery(heat: number, hintStrength: 0 | 1 | 2) {
  const recovery = 22 + hintStrength * 8;
  return Math.max(0, Math.min(100, heat) - recovery);
}
