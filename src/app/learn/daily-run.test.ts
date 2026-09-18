import { describe, expect, it } from "vitest";
import { emptyDailyRun, normalizeDailyRun } from "./daily-run";

describe("SukuuNova daily challenge resume state", () => {
  it("starts empty for a new date", () => {
    expect(emptyDailyRun("2026-09-17")).toEqual({
      dateKey: "2026-09-17",
      questionIndex: 0,
      score: 0,
      submitted: false,
      lastCorrect: false,
      response: "",
    });
  });

  it("restores submitted feedback without allowing impossible scores", () => {
    const state = normalizeDailyRun({
      dateKey: "2026-09-17",
      questionIndex: 5,
      score: 99,
      submitted: true,
      lastCorrect: true,
      response: ["a", "b", 4],
    }, "2026-09-17", 10);

    expect(state.questionIndex).toBe(5);
    expect(state.score).toBe(6);
    expect(state.submitted).toBe(true);
    expect(state.lastCorrect).toBe(true);
    expect(state.response).toEqual(["a", "b"]);
  });

  it("does not restore stale state from another date", () => {
    const state = normalizeDailyRun({
      dateKey: "2026-09-16",
      questionIndex: 7,
      score: 6,
      submitted: true,
      lastCorrect: true,
      response: "a",
    }, "2026-09-17", 10);

    expect(state).toEqual(emptyDailyRun("2026-09-17"));
  });

  it("does not restore an unsubmitted answer after refresh", () => {
    const state = normalizeDailyRun({
      dateKey: "2026-09-17",
      questionIndex: 3,
      score: 2,
      submitted: false,
      response: "draft",
    }, "2026-09-17", 10);

    expect(state.questionIndex).toBe(3);
    expect(state.score).toBe(2);
    expect(state.response).toBe("");
  });
});
