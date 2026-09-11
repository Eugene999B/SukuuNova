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

export function codeBotsCycleDurationMs(difficulty: number, speedScale: number, supportMode: CodeBotsSupportMode) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeSpeed = Math.max(0.65, Math.min(1.45, speedScale));
  const supportFactor = supportMode === "guided" ? 1.22 : supportMode === "supported" ? 1.1 : supportMode === "challenge" ? 0.86 : 1;
  const duration = ((15400 - (safeDifficulty - 1) * 1350) * supportFactor) / safeSpeed;
  return Math.round(Math.max(6200, Math.min(18500, duration)));
}

export function codeBotsOverheatDamage(heat: number, hazardDensity: number, boss = false) {
  const safeHeat = Math.max(0, Math.min(100, heat));
  if (safeHeat < 78) return 0;
  const hazard = Math.max(0.45, Math.min(1.55, hazardDensity));
  const damage = 4 + Math.ceil(((safeHeat - 78) / 22) * 6 * hazard) + (boss ? 2 : 0);
  return Math.max(4, Math.min(15, damage));
}

export function codeBotsPowerReward(heat: number, commandCount: number) {
  const safeHeat = Math.max(0, Math.min(100, heat));
  const sizeBonus = Math.max(0, Math.min(2, Math.floor(Math.max(0, commandCount - 3) / 2)));
  if (safeHeat <= 38) return Math.min(3, 2 + sizeBonus);
  if (safeHeat <= 62) return Math.min(2, 1 + sizeBonus);
  return 0;
}

export function codeBotsEfficiencyChain(current: number, heat: number) {
  return heat <= 55 ? Math.min(9, Math.max(0, Math.trunc(current)) + 1) : 0;
}

export function codeBotsDebugRecovery(heat: number, hintStrength: 0 | 1 | 2) {
  const recovery = 22 + hintStrength * 8;
  return Math.max(0, Math.min(100, heat) - recovery);
}
