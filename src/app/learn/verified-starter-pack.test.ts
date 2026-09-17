import { describe, expect, it } from "vitest";
import { STARTER_FOUNDRY_PACK, STARTER_PACK_AUDIT, VERIFIED_STARTER_QUESTIONS } from "./verified-starter-pack";

describe("SukuuNova verified starter question pack", () => {
  it("contains only publishable questions", () => {
    expect(STARTER_FOUNDRY_PACK).toHaveLength(10);
    expect(STARTER_PACK_AUDIT.publishable).toBe(10);
    expect(STARTER_PACK_AUDIT.held).toBe(0);
    expect(STARTER_PACK_AUDIT.errors).toBe(0);
    expect(VERIFIED_STARTER_QUESTIONS).toHaveLength(10);
  });

  it("has no duplicate exposure keys or duplicate prompt fingerprints", () => {
    expect(STARTER_PACK_AUDIT.duplicateExposureKeys).toEqual([]);
    expect(STARTER_PACK_AUDIT.duplicatePrompts).toEqual([]);
  });

  it("covers the launch subjects with more than one interaction format", () => {
    const subjects = new Set(VERIFIED_STARTER_QUESTIONS.map((question) => question.subject));
    const kinds = new Set(VERIFIED_STARTER_QUESTIONS.map((question) => question.kind));

    expect(subjects).toEqual(new Set(["Mathematics", "English Language", "Science", "Computing", "Social Studies"]));
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });
});
