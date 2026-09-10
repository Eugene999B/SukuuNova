export type ArcadeRecommendationGame = {
  gameKey: string;
  category: string;
  engine: string;
};

export type ArcadeRecommendationProgress = {
  game: string;
  rounds: number;
  accuracy?: number | null;
};

export type ArcadeRecommendationRecent = {
  game: string;
};

type Candidate<T extends ArcadeRecommendationGame> = {
  game: T;
  rounds: number;
  accuracy: number | null;
  recentRank: number;
};

export function chooseVariedArcadeMissions<T extends ArcadeRecommendationGame>(
  games: readonly T[],
  progress: readonly ArcadeRecommendationProgress[],
  recent: readonly ArcadeRecommendationRecent[],
  limit = 3,
): T[] {
  if (limit <= 0 || games.length === 0) return [];

  const progressByGame = new Map(progress.map((item) => [item.game, item]));
  const recentRank = new Map<string, number>();
  recent.forEach((item, index) => {
    if (!recentRank.has(item.game)) recentRank.set(item.game, index + 1);
  });

  const pool: Candidate<T>[] = games.map((game) => {
    const item = progressByGame.get(game.gameKey);
    return {
      game,
      rounds: Math.max(0, item?.rounds ?? 0),
      accuracy: typeof item?.accuracy === "number" ? item.accuracy : null,
      recentRank: recentRank.get(game.gameKey) ?? Number.POSITIVE_INFINITY,
    };
  });

  const selected: Candidate<T>[] = [];
  const usedCategories = new Set<string>();
  const usedEngines = new Set<string>();

  while (selected.length < Math.min(limit, pool.length)) {
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      if (selected.some((item) => item.game.gameKey === candidate.game.gameKey)) continue;

      const categoryPenalty = usedCategories.has(candidate.game.category) ? 500 : 0;
      const enginePenalty = usedEngines.has(candidate.game.engine) ? 180 : 0;
      const recentPenalty = Number.isFinite(candidate.recentRank) ? Math.max(0, 620 - candidate.recentRank * 110) : 0;
      const masteryPenalty = candidate.rounds * 65;
      const supportBonus = candidate.accuracy !== null && candidate.accuracy < 70 ? -55 : 0;
      const score = categoryPenalty + enginePenalty + recentPenalty + masteryPenalty + supportBonus + index / 1000;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) break;
    const chosen = pool[bestIndex];
    selected.push(chosen);
    usedCategories.add(chosen.game.category);
    usedEngines.add(chosen.game.engine);
  }

  return selected.map((item) => item.game);
}
