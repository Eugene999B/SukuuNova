import { describe, expect, it } from "vitest";
import { buildConfidenceSession, CONFIDENCE_CHECK_SIZE } from "./confidence-session";

describe("SukuuNova confidence session", () => {
  it("is deterministic for the same date", () => {
    const first = buildConfidenceSession("2026-09-17");
    const second = buildConfidenceSession("2026-09-17");
    expect(second.map((question) => question.id)).toEqual(first.map((question) => question.id));
  });

  it("uses the expected size with unique exposure keys", () => {
    const session = buildConfidenceSession("2026-09-17");
    expect(session).toHaveLength(CONFIDENCE_CHECK_SIZE);
    expect(new Set(session.map((question) => question.exposureKey)).size).toBe(CONFIDENCE_CHECK_SIZE);
  });

  it("changes the seeded set across dates", () => {
    const first = buildConfidenceSession("2026-09-17").map((question) => question.id);
    const next = buildConfidenceSession("2026-09-18").map((question) => question.id);
    expect(next).not.toEqual(first);
  });
});
