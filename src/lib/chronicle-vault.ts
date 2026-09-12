type SupportMode = "guided" | "supported" | "independent" | "challenge";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function chronicleCaseDurationMs(difficulty: number, speedScale: number, supportMode: SupportMode) {
  const supportBonus = supportMode === "guided" ? 6000 : supportMode === "supported" ? 3200 : supportMode === "challenge" ? -2000 : 0;
  return Math.round(clamp((22500 - clamp(difficulty, 1, 5) * 1450 + supportBonus) / clamp(speedScale, 0.65, 1.6), 9000, 28000));
}

export function chronicleParadoxDamage(pressure: number, hazardDensity: number, boss: boolean) {
  if (pressure < 52) return 0;
  return clamp(2 + Math.floor((clamp(pressure, 0, 100) - 52) / 13) + Math.round(clamp(hazardDensity, 0, 2) * 2) + (boss ? 2 : 0), 2, 12);
}

export function chronicleLensRecovery(pressure: number, hintStrength: 0 | 1 | 2) {
  return clamp(Math.round(clamp(pressure, 0, 100) - (17 + hintStrength * 7)), 0, 100);
}

export function chronicleIntegrityReward(pressure: number, difficulty: number) {
  const pace = pressure <= 35 ? 5 : pressure <= 70 ? 3 : 1;
  return clamp(pace + Math.floor(clamp(difficulty, 1, 5) / 2), 2, 9);
}

export function chronicleInsightReward(paradoxLevel: number, pressure: number) {
  return clamp(Math.round(clamp(paradoxLevel, 1, 5)) + (pressure <= 45 ? 2 : pressure <= 75 ? 1 : 0), 1, 7);
}

export function chronicleChainGain(pressure: number) {
  return pressure <= 36 ? 2 : pressure <= 72 ? 1 : 0;
}

export function chronicleRestoreOrder(savedAnswer: string, options: readonly string[]) {
  const fallback = [...options];
  if (!savedAnswer.trim()) return fallback;
  try {
    const parsed = JSON.parse(savedAnswer);
    if (!Array.isArray(parsed) || parsed.length !== options.length || !parsed.every((item) => typeof item === "string")) return fallback;
    if (new Set(parsed).size !== parsed.length) return fallback;
    const expected = [...options].sort();
    const candidate = [...parsed].sort();
    return candidate.every((item, index) => item === expected[index]) ? parsed as string[] : fallback;
  } catch {
    return fallback;
  }
}
