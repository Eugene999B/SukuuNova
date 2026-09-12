export type StoryLabProductionStage = "sketch" | "rough-cut" | "scene-builder" | "premiere";

export function storyLabNextOption(current: number, direction: number, total: number) {
  const count = Math.max(1, Math.trunc(total));
  const safe = ((Math.trunc(current) % count) + count) % count;
  return (safe + Math.trunc(direction) + count * 4) % count;
}

export function storyLabSparkReward(difficulty: number, revisions: number) {
  const level = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const revisionPenalty = Math.min(2, Math.max(0, Math.trunc(revisions / 3)));
  return Math.max(1, level + 2 - revisionPenalty);
}

export function storyLabProductionStage(completed: number, total: number): StoryLabProductionStage {
  const count = Math.max(1, Math.trunc(total));
  const ratio = Math.max(0, Math.min(1, completed / count));
  if (ratio >= 1) return "premiere";
  if (ratio >= 0.66) return "scene-builder";
  if (ratio >= 0.33) return "rough-cut";
  return "sketch";
}

export function storyLabFreeFrameNext(current: number, total = 3) {
  return storyLabNextOption(current, 1, total);
}
