import { describe, expect, it } from "vitest";
import {
  isRichInteractionCorrect,
  isRichInteractionPublishable,
  validateRichInteraction,
} from "./rich-interactions";
import { RELEASED_RICH_INTERACTIONS, RICH_STARTER_FOUNDRY_PACK } from "./rich-starter-pack";

describe("SukuuNova rich learning interactions", () => {
  it("publishes every reviewed starter interaction", () => {
    expect(RICH_STARTER_FOUNDRY_PACK.every(isRichInteractionPublishable)).toBe(true);
    expect(RELEASED_RICH_INTERACTIONS).toHaveLength(RICH_STARTER_FOUNDRY_PACK.length);
  });

  it("contains both matching and ordering formats", () => {
    const kinds = new Set(RELEASED_RICH_INTERACTIONS.map((question) => question.kind));
    expect(kinds).toEqual(new Set(["matching", "ordering"]));
  });

  it("scores matching answers positionally", () => {
    const question = RELEASED_RICH_INTERACTIONS.find((item) => item.kind === "matching");
    expect(question).toBeDefined();
    if (!question) return;

    expect(isRichInteractionCorrect(question, [...question.answer])).toBe(true);
    expect(isRichInteractionCorrect(question, [...question.answer].reverse())).toBe(false);
  });

  it("scores ordering answers only when the full sequence is correct", () => {
    const question = RELEASED_RICH_INTERACTIONS.find((item) => item.kind === "ordering");
    expect(question).toBeDefined();
    if (!question) return;

    expect(isRichInteractionCorrect(question, [...question.answer])).toBe(true);
    expect(isRichInteractionCorrect(question, question.answer.slice(0, -1))).toBe(false);
  });

  it("rejects a matching interaction whose answer does not cover every prompt", () => {
    const source = RICH_STARTER_FOUNDRY_PACK.find((item) => item.kind === "matching");
    expect(source).toBeDefined();
    if (!source || source.kind !== "matching") return;

    const broken = { ...source, answer: source.answer.slice(0, 1) };
    const codes = validateRichInteraction(broken).map((issue) => issue.code);
    expect(codes).toContain("matching-answer-length");
  });

  it("rejects an ordering interaction that omits a displayed item", () => {
    const source = RICH_STARTER_FOUNDRY_PACK.find((item) => item.kind === "ordering");
    expect(source).toBeDefined();
    if (!source || source.kind !== "ordering") return;

    const broken = { ...source, answer: source.answer.slice(0, -1) };
    const codes = validateRichInteraction(broken).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["ordering-answer-length", "ordering-missing-option"]));
  });
});
