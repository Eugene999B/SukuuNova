import { describe, expect, it } from "vitest";
import { assertTeachingWeekNumber, DEFAULT_TEACHING_WEEKS, MAX_TEACHING_WEEKS, normalizeTeachingWeeks } from "../src/lib/term-teaching-weeks";

describe("authoritative teaching weeks", () => {
  it("keeps valid configured teaching-week counts", () => {
    expect(normalizeTeachingWeeks(1)).toBe(1);
    expect(normalizeTeachingWeeks(12)).toBe(12);
    expect(normalizeTeachingWeeks(MAX_TEACHING_WEEKS)).toBe(MAX_TEACHING_WEEKS);
  });

  it("falls back safely when legacy term data is missing or invalid", () => {
    expect(normalizeTeachingWeeks(undefined)).toBe(DEFAULT_TEACHING_WEEKS);
    expect(normalizeTeachingWeeks(0)).toBe(DEFAULT_TEACHING_WEEKS);
    expect(normalizeTeachingWeeks(MAX_TEACHING_WEEKS + 1)).toBe(DEFAULT_TEACHING_WEEKS);
  });

  it("rejects teacher work outside the configured term week range", () => {
    expect(() => assertTeachingWeekNumber(1, 12)).not.toThrow();
    expect(() => assertTeachingWeekNumber(12, 12)).not.toThrow();
    expect(() => assertTeachingWeekNumber(13, 12)).toThrow("Choose a teaching week between 1 and 12.");
    expect(() => assertTeachingWeekNumber(0, 12)).toThrow("Choose a teaching week between 1 and 12.");
  });
});
