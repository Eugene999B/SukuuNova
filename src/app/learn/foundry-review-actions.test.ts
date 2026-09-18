import { describe, expect, it } from "vitest";
import type { FoundryReviewRow } from "./foundry-review";
import {
  clearLocalReviewDecision,
  filterFoundryRowsByLocalDecision,
  normalizeLocalReviewMap,
  setLocalReviewDecision,
  summarizeLocalReviews,
} from "./foundry-review-actions";

const rows = [
  { id: "q1" },
  { id: "q2" },
  { id: "q3" },
] as FoundryReviewRow[];

describe("Question Foundry local reviewer decisions", () => {
  it("normalizes persisted decisions and drops malformed or unknown records", () => {
    const normalized = normalizeLocalReviewMap(
      {
        q1: { decision: "approved", note: " Ready ", updatedAt: "2026-09-17T09:00:00.000Z" },
        q2: { decision: "maybe", note: "bad", updatedAt: "nope" },
        stale: { decision: "held", note: "old", updatedAt: "2026-09-17T09:00:00.000Z" },
      },
      rows.map((row) => row.id),
    );

    expect(normalized).toEqual({
      q1: { decision: "approved", note: "Ready", updatedAt: "2026-09-17T09:00:00.000Z" },
    });
  });

  it("sets and clears decisions without mutating the previous map", () => {
    const original = {};
    const approved = setLocalReviewDecision(original, "q1", "approved", "Looks good", "2026-09-17T09:10:00.000Z");
    const held = setLocalReviewDecision(approved, "q2", "held", "Check wording", "2026-09-17T09:11:00.000Z");
    const cleared = clearLocalReviewDecision(held, "q1");

    expect(original).toEqual({});
    expect(approved.q1.decision).toBe("approved");
    expect(held.q2.note).toBe("Check wording");
    expect(cleared.q1).toBeUndefined();
    expect(cleared.q2.decision).toBe("held");
  });

  it("summarizes only decisions attached to current queue rows", () => {
    const summary = summarizeLocalReviews(rows, {
      q1: { decision: "approved", note: "", updatedAt: "" },
      q2: { decision: "held", note: "", updatedAt: "" },
      stale: { decision: "approved", note: "", updatedAt: "" },
    });

    expect(summary).toEqual({ total: 3, approved: 1, held: 1, pending: 1 });
  });

  it("filters pending, approved and held reviewer states", () => {
    const decisions = {
      q1: { decision: "approved" as const, note: "", updatedAt: "" },
      q2: { decision: "held" as const, note: "", updatedAt: "" },
    };

    expect(filterFoundryRowsByLocalDecision(rows, decisions, "approved").map((row) => row.id)).toEqual(["q1"]);
    expect(filterFoundryRowsByLocalDecision(rows, decisions, "held").map((row) => row.id)).toEqual(["q2"]);
    expect(filterFoundryRowsByLocalDecision(rows, decisions, "pending").map((row) => row.id)).toEqual(["q3"]);
    expect(filterFoundryRowsByLocalDecision(rows, decisions, "all")).toHaveLength(3);
  });
});
