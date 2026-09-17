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
  it("expands the reviewed standard library to 45 publishable questions", () => {
    expect(STANDARD_FOUNDRY_PACK).toHaveLength(45);
    expect(VERIFIED_STANDARD_QUESTIONS).toHaveLength(45);
    expect(STANDARD_CONTENT_AUDIT.publishable).toBe(45);
    expect(STANDARD_CONTENT_AUDIT.errors).toBe(0);
    expect(STANDARD_CONTENT_AUDIT.duplicateExposureKeys).toEqual([]);
    expect(STANDARD_CONTENT_AUDIT.duplicatePrompts).toEqual([]);
  });

  it("keeps the depth expansion balanced across the five launch subjects", () => {
    expect(STANDARD_CONTENT_COVERAGE.map((entry) => entry.subject)).toEqual(EXPECTED_SUBJECTS);
    for (const entry of STANDARD_CONTENT_COVERAGE) {
      expect(entry.count).toBe(9);
      expect(entry.topics).toHaveLength(4);
    }
  });

  it("covers all four starter topics for every launch subject", () => {
    const bySubject = Object.fromEntries(STANDARD_CONTENT_COVERAGE.map((entry) => [entry.subject, entry.topics]));

    expect(bySubject.Mathematics).toEqual(expect.arrayContaining(["Number & operations", "Algebra", "Geometry", "Statistics & probability"]));
    expect(bySubject["English Language"]).toEqual(expect.arrayContaining(["Grammar & concord", "Vocabulary", "Reading comprehension", "Writing"]));
    expect(bySubject.Science).toEqual(expect.arrayContaining(["Living things", "Matter & materials", "Force & energy", "Environment"]));
    expect(bySubject["Social Studies"]).toEqual(expect.arrayContaining(["Governance", "Citizenship", "People & environment", "National development"]));
    expect(bySubject.Computing).toEqual(expect.arrayContaining(["Digital safety", "Computer systems", "Internet & networks", "Computational thinking"]));
  });
});
