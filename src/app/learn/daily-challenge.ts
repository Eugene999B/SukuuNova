import { buildLearningSession, type LearnQuestion } from "./learning-engine";

export const DAILY_CHALLENGE_SIZE = 10;
export const DAILY_HISTORY_STORAGE_KEY = "sukuunova-learn-daily-v1";

export type DailyCompletion = {
  dateKey: string;
  score: number;
  total: number;
  completedAt: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dailySeed(dateKey: string) {
  let hash = 2166136261;
  for (let index = 0; index < dateKey.length; index += 1) {
    hash ^= dateKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * The question set is fixed by calendar date so a learner can leave and return
 * without the challenge changing underneath them. Recent exposure only changes
 * the order inside that fixed set: fresh questions appear before recycled ones.
 */
export function buildDailyChallenge(dateKey: string, seen: string[] = []): LearnQuestion[] {
  const base = buildLearningSession({
    lane: "school",
    programId: "ghana",
    levelId: "jhs-3",
    subjectId: "all",
    topicId: "all",
    mode: "random",
    count: DAILY_CHALLENGE_SIZE,
    seen: [],
    seed: dailySeed(dateKey),
  });
  const recent = new Set(seen);
  return [...base.filter((question) => !recent.has(question.exposureKey)), ...base.filter((question) => recent.has(question.exposureKey))];
}

export function normalizeDailyHistory(value: unknown): DailyCompletion[] {
  if (!Array.isArray(value)) return [];
  const byDate = new Map<string, DailyCompletion>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<DailyCompletion>;
    if (typeof candidate.dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.dateKey)) continue;
    const total = typeof candidate.total === "number" && Number.isFinite(candidate.total) ? Math.max(1, Math.floor(candidate.total)) : DAILY_CHALLENGE_SIZE;
    const score = typeof candidate.score === "number" && Number.isFinite(candidate.score) ? Math.max(0, Math.min(total, Math.floor(candidate.score))) : 0;
    byDate.set(candidate.dateKey, {
      dateKey: candidate.dateKey,
      score,
      total,
      completedAt: typeof candidate.completedAt === "string" ? candidate.completedAt : `${candidate.dateKey}T00:00:00.000Z`,
    });
  }
  return [...byDate.values()].sort((left, right) => right.dateKey.localeCompare(left.dateKey)).slice(0, 60);
}

export function recordDailyCompletion(history: DailyCompletion[], completion: DailyCompletion) {
  return normalizeDailyHistory([completion, ...history.filter((item) => item.dateKey !== completion.dateKey)]);
}

function dayNumber(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function dailyStudyStreak(history: DailyCompletion[], todayKey: string) {
  const completedDays = new Set(normalizeDailyHistory(history).map((item) => dayNumber(item.dateKey)));
  const today = dayNumber(todayKey);
  let cursor = completedDays.has(today) ? today : today - 1;
  let streak = 0;
  while (completedDays.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}
