type SupportMode = "guided" | "supported" | "independent" | "challenge";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Ambient archive pulse only; historical investigation is never a speed test. */
export function chronicleCaseDurationMs(difficulty: number, speedScale: number, supportMode: SupportMode) {
  const supportBonus = supportMode === "guided" ? 6000 : supportMode === "supported" ? 3200 : supportMode === "challenge" ? -2000 : 0;
  return Math.round(clamp((22500 - clamp(difficulty, 1, 5) * 1450 + supportBonus) / clamp(speedScale, 0.65, 1.6), 9000, 28000));
}

export function chronicleParadoxDamage(_pressure: number, _hazardDensity: number, _boss: boolean) {
  return 0;
}

export function chronicleLensRecovery(pressure: number, hintStrength: 0 | 1 | 2) {
  return clamp(Math.round(clamp(pressure, 0, 100) - (17 + hintStrength * 7)), 0, 100);
}

export function chronicleIntegrityReward(_pressure: number, difficulty: number) {
  return clamp(4 + Math.floor(clamp(difficulty, 1, 5) / 2), 4, 6);
}

export function chronicleInsightReward(paradoxLevel: number, _pressure: number) {
  return clamp(Math.round(clamp(paradoxLevel, 1, 5)) + 1, 2, 6);
}

export function chronicleChainGain(_pressure: number) {
  return 1;
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
