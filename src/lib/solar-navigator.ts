export type SolarSupportMode = "guided" | "supported" | "independent" | "challenge";

/** Ambient navigation pulse only; route-planning time never damages the mission. */
export function solarFlightWindowMs(difficulty: number, speedScale = 1, supportMode: SolarSupportMode = "independent") {
  const level = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const supportBonus = supportMode === "guided" ? 7000 : supportMode === "supported" ? 3500 : supportMode === "challenge" ? -1500 : 0;
  const base = 25000 - (level - 1) * 2200;
  return Math.max(12000, Math.min(32000, Math.round(base / Math.max(.7, Math.min(1.5, speedScale)) + supportBonus)));
}

export function solarDriftDamage(_pressure: number, _hazardDensity: number, _fuelRisk: number) {
  return 0;
}

export function solarScanRecovery(pressure: number, hintStrength: number) {
  const safePressure = Math.max(0, Math.min(1, pressure));
  const strength = Math.max(0, Math.min(2, Math.trunc(hintStrength)));
  return Math.max(0, Math.min(.45, safePressure * (.18 + strength * .08)));
}

export function solarFuelReward(difficulty: number, _revisions: number, fuelRisk: number) {
  const level = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const risk = Math.max(1, Math.min(5, Math.trunc(fuelRisk)));
  return Math.max(3, Math.min(12, 4 + level + Math.ceil(risk / 2)));
}

export function solarOrbitChain(current: number, _revisions: number) {
  return Math.max(0, Math.min(9, current + 1));
}

export function solarScanTokens(difficulty: number, supportMode: SolarSupportMode) {
  const level = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const support = supportMode === "guided" ? 2 : supportMode === "supported" ? 1 : 0;
  return Math.max(1, Math.min(5, 4 - Math.floor(level / 2) + support));
}
