export type GeoQuestSupportMode = "guided" | "supported" | "independent" | "challenge";
export type GeoQuestRoute = "road" | "trail" | "drone";
export type GeoPoint = { x: number; y: number };

export function geoQuestWeatherDurationMs(difficulty: number, speedScale: number, supportMode: GeoQuestSupportMode) {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeSpeed = Math.max(0.65, Math.min(1.45, speedScale));
  const supportFactor = supportMode === "guided" ? 1.24 : supportMode === "supported" ? 1.1 : supportMode === "challenge" ? 0.86 : 1;
  const duration = ((16000 - (safeDifficulty - 1) * 1300) * supportFactor) / safeSpeed;
  return Math.round(Math.max(6500, Math.min(19000, duration)));
}

export function geoQuestDistance(from: GeoPoint, to: GeoPoint) {
  const dx = Math.max(-100, Math.min(100, to.x - from.x));
  const dy = Math.max(-100, Math.min(100, to.y - from.y));
  return Math.sqrt(dx * dx + dy * dy);
}

export function geoQuestTravelCost(distance: number, route: GeoQuestRoute, difficulty: number) {
  const safeDistance = Math.max(0, Math.min(140, distance));
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const routeFactor = route === "trail" ? 0.78 : route === "drone" ? 1.18 : 0.92;
  return Math.max(3, Math.min(22, Math.round((4 + safeDistance / 10 + safeDifficulty * 0.7) * routeFactor)));
}

export function geoQuestRouteWeatherRelief(route: GeoQuestRoute) {
  return route === "drone" ? 18 : route === "trail" ? 11 : 7;
}

export function geoQuestStormDamage(weather: number, hazardDensity: number, boss = false) {
  const safeWeather = Math.max(0, Math.min(100, weather));
  if (safeWeather < 80) return 0;
  const hazard = Math.max(0.45, Math.min(1.55, hazardDensity));
  const damage = 4 + Math.ceil(((safeWeather - 80) / 20) * 6 * hazard) + (boss ? 2 : 0);
  return Math.max(4, Math.min(14, damage));
}

export function geoQuestScanRecovery(weather: number, hintStrength: 0 | 1 | 2) {
  const recovery = 24 + hintStrength * 8;
  return Math.max(0, Math.min(100, weather) - recovery);
}

export function geoQuestCompassReward(weather: number) {
  const safe = Math.max(0, Math.min(100, weather));
  if (safe <= 38) return 2;
  if (safe <= 62) return 1;
  return 0;
}
