export type AstroSystem = "shields" | "reactor" | "navigation";

const SYSTEMS: AstroSystem[] = ["shields", "reactor", "navigation"];

export function astroSystemForCheckpoint(index: number): AstroSystem {
  return SYSTEMS[Math.abs(Math.trunc(index)) % SYSTEMS.length];
}

/** Ambient threat animation only; physics reasoning time does not damage the station. */
export function astroThreatDurationMs(difficulty: number, speedScale = 1, supportMode = "independent") {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeScale = Math.max(0.7, Math.min(1.2, Number.isFinite(speedScale) ? speedScale : 1));
  const supportFactor = supportMode === "guided" ? 1.22 : supportMode === "supported" ? 1.1 : supportMode === "challenge" ? 0.92 : 1;
  return Math.round(Math.max(5500, Math.min(15000, (11800 - safeDifficulty * 780) * supportFactor / safeScale)));
}

export function astroSystemDrain(_threatPercent: number, _hazardDensity = 0.9, _boss = false) {
  return 0;
}

export function astroPowerReward(_threatPercent: number) {
  return 2;
}
