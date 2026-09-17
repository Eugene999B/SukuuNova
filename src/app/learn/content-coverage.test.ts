import { describe, expect, it } from "vitest";
import { SCHOOL_STARTER_COVERAGE_SUMMARY, SCHOOL_STARTER_TOPIC_COVERAGE } from "./content-coverage";

describe("SukuuNova school starter topic coverage", () => {
  it("covers every topic in the current five-subject starter taxonomy", () => {
    expect(SCHOOL_STARTER_COVERAGE_SUMMARY.totalTopics).toBe(20);
    expect(SCHOOL_STARTER_COVERAGE_SUMMARY.coveredTopics).toBe(20);
    expect(SCHOOL_STARTER_COVERAGE_SUMMARY.missingTopics).toEqual([]);
  });

  it("keeps every covered topic backed by at least one reviewed standard question", () => {
    expect(SCHOOL_STARTER_TOPIC_COVERAGE.every((entry) => entry.questionCount >= 1)).toBe(true);
  });

  it("tracks four starter topics for each launch subject", () => {
    const counts = SCHOOL_STARTER_TOPIC_COVERAGE.reduce<Record<string, number>>((result, entry) => {
      result[entry.subject] = (result[entry.subject] ?? 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual({
      Mathematics: 4,
      "English Language": 4,
      Science: 4,
      "Social Studies": 4,
      Computing: 4,
    });
  });
});
