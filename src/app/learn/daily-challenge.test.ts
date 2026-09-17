import { describe, expect, it } from "vitest";
import {
  buildDailyChallenge,
  dailySeed,
  dailyStudyStreak,
  localDateKey,
  normalizeDailyHistory,
  recordDailyCompletion,
} from "./daily-challenge";

describe("SukuuNova Today's 10", () => {
  it("builds the same exposure-unique challenge for the same date", () => {
    const first = buildDailyChallenge("2026-09-17");
    const second = buildDailyChallenge("2026-09-17");

    expect(first).toHaveLength(10);
    expect(second.map((question) => question.id)).toEqual(first.map((question) => question.id));
    expect(new Set(first.map((question) => question.exposureKey)).size).toBe(10);
  });

  it("keeps the daily question set stable when recent exposure changes", () => {
    const baseline = buildDailyChallenge("2026-09-17");
    const reordered = buildDailyChallenge("2026-09-17", baseline.slice(0, 4).map((question) => question.exposureKey));

    expect(new Set(reordered.map((question) => question.id))).toEqual(new Set(baseline.map((question) => question.id)));
    expect(reordered.slice(-4).map((question) => question.id)).toEqual(baseline.slice(0, 4).map((question) => question.id));
  });

  it("changes the deterministic seed across dates", () => {
    expect(dailySeed("2026-09-17")).not.toBe(dailySeed("2026-09-18"));
  });

  it("uses the learner's local calendar date", () => {
    expect(localDateKey(new Date(2026, 8, 17, 23, 30))).toBe("2026-09-17");
  });

  it("normalizes duplicate and malformed completion history", () => {
    const history = normalizeDailyHistory([
      { dateKey: "2026-09-17", score: 15, total: 10, completedAt: "now" },
      { dateKey: "2026-09-17", score: 7, total: 10, completedAt: "later" },
      { dateKey: "bad", score: 2, total: 10 },
    ]);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ dateKey: "2026-09-17", score: 7, total: 10 });
  });

  it("records one completion per day and calculates a forgiving study streak", () => {
    const history = [
      { dateKey: "2026-09-16", score: 8, total: 10, completedAt: "2026-09-16T12:00:00.000Z" },
      { dateKey: "2026-09-15", score: 7, total: 10, completedAt: "2026-09-15T12:00:00.000Z" },
    ];
    const updated = recordDailyCompletion(history, {
      dateKey: "2026-09-17",
      score: 9,
      total: 10,
      completedAt: "2026-09-17T12:00:00.000Z",
    });

    expect(updated).toHaveLength(3);
    expect(dailyStudyStreak(updated, "2026-09-17")).toBe(3);
    expect(dailyStudyStreak(history, "2026-09-17")).toBe(2);
  });
});
