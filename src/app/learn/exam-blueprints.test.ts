import { describe, expect, it } from "vitest";
import { EXAM_BLUEPRINTS, examBlueprint, practiceReadySubjects } from "./exam-blueprints";

describe("SukuuNova Learn exam blueprints", () => {
  it("keeps exam references versioned and source-backed", () => {
    for (const blueprint of EXAM_BLUEPRINTS) {
      expect(blueprint.referenceYear).toBe(2026);
      expect(blueprint.lastVerified).toBe("2026-09-19");
      expect(blueprint.sourceUrl.startsWith("https://")).toBe(true);
      expect(blueprint.authority).toContain("West African Examinations Council");
    }
  });

  it("models the verified 2026 BECE starter subjects without duplicate ids", () => {
    const bece = examBlueprint("bece-2026");
    const ids = bece.subjects.map((subject) => subject.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["english", "social-studies", "science", "mathematics", "computing"]));
    expect(practiceReadySubjects(bece)).toHaveLength(5);
  });

  it("records the four WASSCE school core subjects separately from electives", () => {
    const wassce = examBlueprint("wassce-2026");
    expect(wassce.subjects.map((subject) => subject.label)).toEqual([
      "English Language",
      "Integrated Science",
      "Mathematics (Core)",
      "Social Studies",
    ]);
  });

  it("does not claim a full mock where paper-specific content is not implemented", () => {
    const bece = examBlueprint("bece-2026");
    const wassce = examBlueprint("wassce-2026");
    expect(practiceReadySubjects(bece).every((subject) => subject.practiceScope === "topic" && subject.fullMockReady === false)).toBe(true);
    expect(practiceReadySubjects(wassce)).toHaveLength(0);
  });

  it("keeps every timed paper duration positive", () => {
    const durations = EXAM_BLUEPRINTS.flatMap((blueprint) =>
      blueprint.subjects.flatMap((subject) => subject.papers ?? []).map((paper) => paper.durationMinutes),
    ).filter((value): value is number => value !== undefined);

    expect(durations.length).toBeGreaterThan(0);
    expect(durations.every((duration) => duration > 0)).toBe(true);
  });
});
