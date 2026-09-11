export type AstroSystem = "shields" | "reactor" | "navigation";

const SYSTEMS: AstroSystem[] = ["shields", "reactor", "navigation"];

export function astroSystemForCheckpoint(index: number): AstroSystem {
  return SYSTEMS[Math.abs(Math.trunc(index)) % SYSTEMS.length];
}

export function astroThreatDurationMs(difficulty: number, speedScale = 1, supportMode = "independent") {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeScale = Math.max(0.7, Math.min(1.2, Number.isFinite(speedScale) ? speedScale : 1));
  const supportFactor = supportMode === "guided" ? 1.22 : supportMode === "supported" ? 1.1 : supportMode === "challenge" ? 0.92 : 1;
  return Math.round(Math.max(5500, Math.min(15000, (11800 - safeDifficulty * 780) * supportFactor / safeScale)));
}

export function astroSystemDrain(threatPercent: number, hazardDensity = 0.9, boss = false) {
  const safeThreat = Math.max(0, Math.min(100, Number.isFinite(threatPercent) ? threatPercent : 0));
  const safeHazard = Math.max(0.4, Math.min(1.2, Number.isFinite(hazardDensity) ? hazardDensity : 0.9));
  const bossFactor = boss ? 1.2 : 1;
  return Math.max(3, Math.min(18, Math.round((3 + safeThreat / 13) * safeHazard * bossFactor)));
}

export function astroPowerReward(threatPercent: number) {
  const safeThreat = Math.max(0, Math.min(100, Number.isFinite(threatPercent) ? threatPercent : 0));
  if (safeThreat < 35) return 3;
  if (safeThreat < 70) return 2;
  return 1;
}
