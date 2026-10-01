import type { PublicAdaptiveLearningPlan } from "../adaptive-learning-director";

export type RuntimeChallengeEnvelope = {
  /** Freeze at mission start; do not retune movement controls mid-run. */
  worldSpeedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  resourceGenerosity: number;
  routeComplexity: number;
  objectiveWindowScale: number;
  bossGate: boolean;
  worldKey: PublicAdaptiveLearningPlan["worldKey"];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Converts the existing academic adaptation plan into gameplay-facing challenge
 * knobs. These values affect the world around the player; they never rewrite
 * acceleration, jump physics, lane timing, camera sensitivity or hitbox feel.
 */
export function buildRuntimeChallengeEnvelope(plan: PublicAdaptiveLearningPlan): RuntimeChallengeEnvelope {
  const support = plan.supportMode;
  const resourceGenerosity = support === "guided" ? 1.35 : support === "supported" ? 1.18 : support === "challenge" ? 0.88 : 1;
  const objectiveWindowScale = support === "guided" ? 1.3 : support === "supported" ? 1.15 : support === "challenge" ? 0.9 : 1;
  const routeComplexity = support === "guided" ? 0.7 : support === "supported" ? 0.85 : support === "challenge" ? 1.15 : 1;

  return {
    worldSpeedScale: clamp(plan.speedScale, 0.75, 1.2),
    hazardDensity: clamp(plan.hazardDensity, 0.35, 1.2),
    hintStrength: plan.hintStrength,
    resourceGenerosity,
    routeComplexity,
    objectiveWindowScale,
    bossGate: plan.bossGate,
    worldKey: plan.worldKey,
  };
}
