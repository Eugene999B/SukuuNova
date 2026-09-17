import { describe, expect, it } from "vitest";
import {
  STANDARD_CONTENT_AUDIT,
  STANDARD_CONTENT_COVERAGE,
  STANDARD_FOUNDRY_PACK,
  VERIFIED_STANDARD_QUESTIONS,
} from "./verified-content";

const EXPECTED_SUBJECTS = [
  "Computing",
  "English Language",
  "Mathematics",
  "Science",
  "Social Studies",
];

describe("SukuuNova verified standard content library", () => {
  it("expands the reviewed standard library to 25 publishable questions", () => {
    expect(STANDARD_FOUNDRY_PACK).toHaveLength(25);
    expect(VERIFIED_STANDARD_QUESTIONS).toHaveLength(25);
    expect(STANDARD_CONTENT_AUDIT.publishable).toBe(25);
    expect(STANDARD_CONTENT_AUDIT.errors).toBe(0);
    expect(STANDARD_CONTENT_AUDIT.duplicateExposureKeys).toEqual([]);
    expect(STANDARD_CONTENT_AUDIT.duplicatePrompts).toEqual([]);
  });

  it("keeps the first expansion balanced across the five launch subjects", () => {
    expect(STANDARD_CONTENT_COVERAGE.map((entry) => entry.subject)).toEqual(EXPECTED_SUBJECTS);
    for (const entry of STANDARD_CONTENT_COVERAGE) {
      expect(entry.count).toBe(5);
      expect(entry.topics.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("adds coverage to topics that were thin in the starter pack", () => {
    const bySubject = Object.fromEntries(STANDARD_CONTENT_COVERAGE.map((entry) => [entry.subject, entry.topics]));

    expect(bySubject.Mathematics).toEqual(expect.arrayContaining(["Geometry", "Statistics & probability"]));
    expect(bySubject["English Language"]).toEqual(expect.arrayContaining(["Reading comprehension", "Writing"]));
    expect(bySubject.Science).toEqual(expect.arrayContaining(["Force & energy", "Environment"]));
    expect(bySubject["Social Studies"]).toEqual(expect.arrayContaining(["People & environment", "National development"]));
    expect(bySubject.Computing).toEqual(expect.arrayContaining(["Computer systems", "Internet & networks", "Computational thinking"]));
  });
});
