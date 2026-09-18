export const DAILY_RUN_STORAGE_KEY = "sukuunova-learn-daily-run-v1";

export type DailyResponseValue = string | string[] | number | boolean;

export type DailyRunState = {
  dateKey: string;
  questionIndex: number;
  score: number;
  submitted: boolean;
  lastCorrect: boolean;
  response: DailyResponseValue;
};

function validResponse(value: unknown): DailyResponseValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return "";
}

export function emptyDailyRun(dateKey: string): DailyRunState {
  return {
    dateKey,
    questionIndex: 0,
    score: 0,
    submitted: false,
    lastCorrect: false,
    response: "",
  };
}

export function normalizeDailyRun(value: unknown, dateKey: string, totalQuestions: number): DailyRunState {
  const empty = emptyDailyRun(dateKey);
  if (!value || typeof value !== "object") return empty;
  const candidate = value as Partial<DailyRunState>;
  if (candidate.dateKey !== dateKey) return empty;

  const maxIndex = Math.max(0, totalQuestions - 1);
  const questionIndex = typeof candidate.questionIndex === "number" && Number.isFinite(candidate.questionIndex)
    ? Math.max(0, Math.min(maxIndex, Math.floor(candidate.questionIndex)))
    : 0;
  const submitted = candidate.submitted === true;
  const maxScore = Math.min(totalQuestions, questionIndex + (submitted ? 1 : 0));
  const score = typeof candidate.score === "number" && Number.isFinite(candidate.score)
    ? Math.max(0, Math.min(maxScore, Math.floor(candidate.score)))
    : 0;

  return {
    dateKey,
    questionIndex,
    score,
    submitted,
    lastCorrect: submitted && candidate.lastCorrect === true,
    response: submitted ? validResponse(candidate.response) : "",
  };
}
