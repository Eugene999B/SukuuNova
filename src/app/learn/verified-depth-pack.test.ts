import { describe, expect, it } from "vitest";
import { DEPTH_FOUNDRY_PACK, DEPTH_PACK_AUDIT, VERIFIED_DEPTH_QUESTIONS } from "./verified-depth-pack";

const EXPECTED_TOPICS = new Set([
  "Number & operations",
  "Algebra",
  "Geometry",
  "Statistics & probability",
  "Grammar & concord",
  "Vocabulary",
  "Reading comprehension",
  "Writing",
  "Living things",
  "Matter & materials",
  "Force & energy",
  "Environment",
  "Governance",
  "Citizenship",
  "People & environment",
  "National development",
  "Digital safety",
  "Computer systems",
  "Internet & networks",
  "Computational thinking",
]);

describe("SukuuNova verified topic-depth pack", () => {
  it("contains one reviewed original question for each starter topic", () => {
    expect(DEPTH_FOUNDRY_PACK).toHaveLength(20);
    expect(new Set(DEPTH_FOUNDRY_PACK.map((question) => question.topic))).toEqual(EXPECTED_TOPICS);
  });

  it("passes the Foundry publish gates without duplicate exposure keys or prompts", () => {
    expect(DEPTH_PACK_AUDIT.publishable).toBe(20);
    expect(DEPTH_PACK_AUDIT.errors).toBe(0);
    expect(DEPTH_PACK_AUDIT.duplicateExposureKeys).toEqual([]);
    expect(DEPTH_PACK_AUDIT.duplicatePrompts).toEqual([]);
    expect(VERIFIED_DEPTH_QUESTIONS).toHaveLength(20);
  });

  it("keeps four depth questions in each launch subject", () => {
    const counts = DEPTH_FOUNDRY_PACK.reduce<Record<string, number>>((result, question) => {
      result[question.subject] = (result[question.subject] ?? 0) + 1;
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
