import { describe, expect, it } from "vitest";
import { EXAM_BLUEPRINTS, examBlueprint, examSubjectCapability, practiceReadySubjects } from "./exam-blueprints";

describe("SukuuNova Learn exam blueprints", () => {
  it("keeps exam references versioned and source-backed", () => {
    for (const blueprint of EXAM_BLUEPRINTS) {
      expect(blueprint.referenceYear).toBe(2026);
      expect(blueprint.lastVerified).toBe("2026-09-17");
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

  it("derives exam readiness from audience-eligible published content", () => {
    const bece = examBlueprint("bece-2026");
    expect(practiceReadySubjects(bece).map((subject) => subject.id).sort()).toEqual([
      "computing",
      "english",
      "mathematics",
      "science",
      "social-studies",
    ]);

    const wassce = examBlueprint("wassce-2026");
    const byId = Object.fromEntries(wassce.subjects.map((subject) => [subject.id, examSubjectCapability(wassce, subject)]));
    expect(byId.english.ready).toBe(true);
    expect(byId["integrated-science"].ready).toBe(true);
    expect(byId["core-mathematics"].ready).toBe(true);
    expect(byId["social-studies"].ready).toBe(false);
  });

  it("keeps every timed paper duration positive", () => {
    const durations = EXAM_BLUEPRINTS.flatMap((blueprint) =>
      blueprint.subjects.flatMap((subject) => subject.papers ?? []).map((paper) => paper.durationMinutes),
    ).filter((value): value is number => value !== undefined);

    expect(durations.length).toBeGreaterThan(0);
    expect(durations.every((duration) => duration > 0)).toBe(true);
  });
});
