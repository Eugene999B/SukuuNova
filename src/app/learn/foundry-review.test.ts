import { describe, expect, it } from "vitest";
import { FOUNDRY_REVIEW_ROWS, FOUNDRY_REVIEW_SUMMARY, filterFoundryRows } from "./foundry-review";

const REQUIRED_CHECKS = [
  "answer-check",
  "ambiguity-check",
  "curriculum-check",
  "duplicate-check",
  "age-check",
];

describe("SukuuNova Question Foundry review queue", () => {
  it("normalizes standard and rich reviewed content into one queue", () => {
    expect(FOUNDRY_REVIEW_SUMMARY.standard).toBe(25);
    expect(FOUNDRY_REVIEW_SUMMARY.rich).toBe(4);
    expect(FOUNDRY_REVIEW_SUMMARY.total).toBe(29);
    expect(new Set(FOUNDRY_REVIEW_ROWS.map((row) => row.id)).size).toBe(29);
  });

  it("shows the current reviewed library as publishable and error free", () => {
    expect(FOUNDRY_REVIEW_SUMMARY.publishable).toBe(29);
    expect(FOUNDRY_REVIEW_SUMMARY.held).toBe(0);
    expect(FOUNDRY_REVIEW_SUMMARY.errors).toBe(0);
  });

  it("keeps provenance, reviewer confidence and all required checks visible", () => {
    for (const row of FOUNDRY_REVIEW_ROWS) {
      expect(row.sourceName.length).toBeGreaterThan(1);
      expect(row.reviewer).not.toBe("Unassigned");
      expect(row.confidence).toBeGreaterThanOrEqual(0.9);
      expect(row.checks).toEqual(expect.arrayContaining(REQUIRED_CHECKS));
    }
  });

  it("filters review rows by family, status, subject and search text", () => {
    expect(filterFoundryRows({ family: "rich" })).toHaveLength(4);
    expect(filterFoundryRows({ family: "standard" })).toHaveLength(25);
    expect(filterFoundryRows({ status: "held" })).toHaveLength(0);
    expect(filterFoundryRows({ subject: "Science" }).length).toBeGreaterThan(0);
    expect(filterFoundryRows({ query: "water cycle" }).map((row) => row.id)).toContain("rich-science-water-cycle-order-001");
    expect(filterFoundryRows({ query: "router" }).map((row) => row.id)).toContain("expand-computing-internet-001");
  });
});
