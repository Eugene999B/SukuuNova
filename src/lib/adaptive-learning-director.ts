import { arcadeDifficultyForAge, type ArcadeVariationAgeBand } from "./arcade-variation";

export type AdaptiveHistoryRound = {
  difficulty: number;
  correct: number;
  roundLength: number;
};

export type AdaptiveSupportMode = "guided" | "supported" | "independent" | "challenge";
export type AdaptiveMissionMode = "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
export type AdaptiveWorldKey = "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";

export type AdaptiveLearningPlan = {
  version: 1;
  targetDifficulty: number;
  recentAccuracy: number | null;
  masteryPercent: number | null;
  supportMode: AdaptiveSupportMode;
  missionMode: AdaptiveMissionMode;
  generationDifficulties: number[];
  freshQuestionTarget: number;
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: AdaptiveWorldKey;
  reasonCodes: string[];
};

export type PublicAdaptiveLearningPlan = Pick<AdaptiveLearningPlan,
  "version" | "targetDifficulty" | "masteryPercent" | "supportMode" | "missionMode" | "speedScale" | "hazardDensity" | "hintStrength" | "bossGate" | "worldKey"
>;

export type AdaptiveLearningInput = {
  game: string;
  ageBand: ArcadeVariationAgeBand;
  suggestedDifficulty: number;
  completedRounds: AdaptiveHistoryRound[];
  completedRoundCount?: number;
  missionId: string;
  challengeMode?: boolean;
};

const WORLDS: AdaptiveWorldKey[] = ["aurora-causeway", "meteor-foundry", "prism-canyon", "nova-citadel"];
const SUPPORT_MODES = new Set<AdaptiveSupportMode>(["guided", "supported", "independent", "challenge"]);
const MISSION_MODES = new Set<AdaptiveMissionMode>(["onboarding", "recovery", "reinforcement", "balanced", "stretch"]);
const WORLD_KEYS = new Set<AdaptiveWorldKey>(WORLDS);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function accuracy(round: AdaptiveHistoryRound) {
  return clamp(round.correct / Math.max(1, round.roundLength), 0, 1);
}

function weightedAccuracy(rounds: AdaptiveHistoryRound[]) {
  const recent = rounds.slice(0, 5);
  if (!recent.length) return null;
  let weighted = 0;
  let weights = 0;
  recent.forEach((round, index) => {
    const weight = recent.length - index;
    weighted += accuracy(round) * weight;
    weights += weight;
  });
  return weights ? weighted / weights : null;
}

function stableHash(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

function generationSequence(target: number, mode: AdaptiveMissionMode) {
  const easier = Math.max(1, target - 1);
  if (mode === "recovery") return [easier, easier, target, easier, target];
  if (mode === "reinforcement") return [target, easier, target, target, easier];
  if (mode === "onboarding") return [target, target, easier, target];
  return [target, target, target, easier, target];
}

export function buildAdaptiveLearningPlan(input: AdaptiveLearningInput): AdaptiveLearningPlan {
  const history = input.completedRounds.slice(0, 6);
  const completedRoundCount = Math.max(history.length, Math.max(0, Math.trunc(input.completedRoundCount ?? history.length)));
  const recentAccuracy = weightedAccuracy(history);
  const targetDifficulty = arcadeDifficultyForAge(input.suggestedDifficulty, input.ageBand);
  const lastTwo = history.slice(0, 2).map(accuracy);
  const lastThree = history.slice(0, 3).map(accuracy);
  const repeatedStruggle = lastTwo.length === 2 && lastTwo.every((value) => value <= 0.45);
  const sustainedStrength = lastThree.length === 3 && lastThree.every((value) => value >= 0.82);

  let missionMode: AdaptiveMissionMode;
  if (!history.length) missionMode = "onboarding";
  else if (repeatedStruggle) missionMode = "recovery";
  else if ((recentAccuracy ?? 0) < 0.68) missionMode = "reinforcement";
  else if (sustainedStrength || (recentAccuracy ?? 0) >= 0.9) missionMode = "stretch";
  else missionMode = "balanced";

  let supportMode: AdaptiveSupportMode;
  if (!history.length || (recentAccuracy ?? 0) < 0.5) supportMode = "guided";
  else if ((recentAccuracy ?? 0) < 0.72) supportMode = "supported";
  else if ((recentAccuracy ?? 0) < 0.9 || history.length < 2) supportMode = "independent";
  else supportMode = "challenge";

  const reasonCodes = [
    !history.length ? "first_mission" : "prior_learning_available",
    repeatedStruggle ? "repeated_struggle" : sustainedStrength ? "sustained_strength" : "stable_progression",
    `support_${supportMode}`,
    `mission_${missionMode}`,
    input.challengeMode ? "challenge_requested" : "standard_mission",
  ];

  const upcomingRunNumber = completedRoundCount + 1;
  const bossGate = completedRoundCount >= 2 && (upcomingRunNumber % 3 === 0 || (Boolean(input.challengeMode) && supportMode === "challenge"));
  const worldSeed = stableHash(`${input.game}:${input.missionId}:${missionMode}:${supportMode}`);
  const worldKey = WORLDS[worldSeed % WORLDS.length];
  const paceBySupport: Record<AdaptiveSupportMode, number> = { guided: 0.84, supported: 0.92, independent: 1, challenge: 1.08 };
  const hazardsBySupport: Record<AdaptiveSupportMode, number> = { guided: 0.55, supported: 0.72, independent: 0.9, challenge: 1 };
  const hintBySupport: Record<AdaptiveSupportMode, 0 | 1 | 2> = { guided: 2, supported: 1, independent: 0, challenge: 0 };

  return {
    version: 1,
    targetDifficulty,
    recentAccuracy: recentAccuracy === null ? null : Number(recentAccuracy.toFixed(4)),
    masteryPercent: recentAccuracy === null ? null : Math.round(recentAccuracy * 100),
    supportMode,
    missionMode,
    generationDifficulties: generationSequence(targetDifficulty, missionMode),
    freshQuestionTarget: missionMode === "recovery" ? 60 : missionMode === "reinforcement" ? 70 : 80,
    speedScale: paceBySupport[supportMode],
    hazardDensity: hazardsBySupport[supportMode],
    hintStrength: hintBySupport[supportMode],
    bossGate,
    worldKey,
    reasonCodes,
  };
}

export function publicAdaptiveLearningPlan(value: unknown): PublicAdaptiveLearningPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  if (typeof candidate.targetDifficulty !== "number" || candidate.targetDifficulty < 1 || candidate.targetDifficulty > 5) return null;
  if (candidate.masteryPercent !== null && (typeof candidate.masteryPercent !== "number" || candidate.masteryPercent < 0 || candidate.masteryPercent > 100)) return null;
  if (!SUPPORT_MODES.has(candidate.supportMode as AdaptiveSupportMode)) return null;
  if (!MISSION_MODES.has(candidate.missionMode as AdaptiveMissionMode)) return null;
  if (typeof candidate.speedScale !== "number" || candidate.speedScale < 0.5 || candidate.speedScale > 1.5) return null;
  if (typeof candidate.hazardDensity !== "number" || candidate.hazardDensity < 0 || candidate.hazardDensity > 1.5) return null;
  if (![0, 1, 2].includes(candidate.hintStrength as number)) return null;
  if (typeof candidate.bossGate !== "boolean") return null;
  if (!WORLD_KEYS.has(candidate.worldKey as AdaptiveWorldKey)) return null;
  return {
    version: 1,
    targetDifficulty: candidate.targetDifficulty,
    masteryPercent: candidate.masteryPercent as number | null,
    supportMode: candidate.supportMode as AdaptiveSupportMode,
    missionMode: candidate.missionMode as AdaptiveMissionMode,
    speedScale: candidate.speedScale,
    hazardDensity: candidate.hazardDensity,
    hintStrength: candidate.hintStrength as 0 | 1 | 2,
    bossGate: candidate.bossGate,
    worldKey: candidate.worldKey as AdaptiveWorldKey,
  };
}
