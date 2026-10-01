import type { GameDNA } from "./types";

export const DEFAULT_GAME_SIMILARITY_LIMIT = 0.6;

const WEIGHTS = {
  category: 0.1,
  genre: 0.08,
  setting: 0.07,
  playerRole: 0.07,
  primaryMechanic: 0.2,
  secondaryMechanics: 0.08,
  interactionStyle: 0.12,
  storyStructure: 0.06,
  pacing: 0.04,
  failureModel: 0.04,
  endingModel: 0.04,
  movementProfileId: 0.05,
  cameraProfileId: 0.05,
} as const;

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

function equal(a: string, b: string) {
  return normalize(a) === normalize(b);
}

function overlap(a: string[], b: string[]) {
  const left = new Set(a.map(normalize));
  const right = new Set(b.map(normalize));
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / union.size;
}

export type GameSimilarityBreakdown = {
  score: number;
  matchedDimensions: string[];
  redesignRequired: boolean;
};

export function scoreGameDnaSimilarity(
  candidate: GameDNA,
  previous: GameDNA,
  limit = DEFAULT_GAME_SIMILARITY_LIMIT,
): GameSimilarityBreakdown {
  let score = 0;
  const matchedDimensions: string[] = [];

  const exactDimensions: Array<[keyof typeof WEIGHTS, string, string]> = [
    ["category", candidate.category, previous.category],
    ["genre", candidate.genre, previous.genre],
    ["setting", candidate.setting, previous.setting],
    ["playerRole", candidate.playerRole, previous.playerRole],
    ["primaryMechanic", candidate.primaryMechanic, previous.primaryMechanic],
    ["interactionStyle", candidate.interactionStyle, previous.interactionStyle],
    ["storyStructure", candidate.storyStructure, previous.storyStructure],
    ["pacing", candidate.pacing, previous.pacing],
    ["failureModel", candidate.failureModel, previous.failureModel],
    ["endingModel", candidate.endingModel, previous.endingModel],
    ["movementProfileId", candidate.movementProfileId, previous.movementProfileId],
    ["cameraProfileId", candidate.cameraProfileId, previous.cameraProfileId],
  ];

  for (const [dimension, left, right] of exactDimensions) {
    if (!equal(left, right)) continue;
    score += WEIGHTS[dimension];
    matchedDimensions.push(dimension);
  }

  const secondaryScore = overlap(candidate.secondaryMechanics, previous.secondaryMechanics);
  if (secondaryScore > 0) {
    score += WEIGHTS.secondaryMechanics * secondaryScore;
    matchedDimensions.push("secondaryMechanics");
  }

  const rounded = Number(Math.min(1, score).toFixed(4));
  return {
    score: rounded,
    matchedDimensions,
    redesignRequired: rounded >= limit,
  };
}

export function findTooSimilarGames(
  candidate: GameDNA,
  recentGames: GameDNA[],
  limit = DEFAULT_GAME_SIMILARITY_LIMIT,
) {
  return recentGames
    .map((game) => ({ game, similarity: scoreGameDnaSimilarity(candidate, game, limit) }))
    .filter((entry) => entry.similarity.redesignRequired)
    .sort((a, b) => b.similarity.score - a.similarity.score);
}

export function gameVarietyGate(candidate: GameDNA, recentGames: GameDNA[]) {
  const conflicts = findTooSimilarGames(candidate, recentGames);
  return {
    accepted: conflicts.length === 0,
    conflicts,
    rule:
      "If a game can be reskinned by changing subject, characters and artwork while keeping its interactions intact, redesign it.",
  };
}
