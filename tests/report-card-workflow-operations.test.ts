import { describe, expect, it } from "vitest";
import {
  isConfiguredFinalTerm,
  needsManualPromotionDecision,
  workflowStatusForAction,
} from "../src/lib/report-card-workflow-operations";

describe("report-card workflow operations", () => {
  it("resolves the configured final term by the ordered academic-year term list", () => {
    const terms = ["term-1", "term-2", "term-3"];
    expect(isConfiguredFinalTerm("term-3", terms, 3)).toBe(true);
    expect(isConfiguredFinalTerm("term-2", terms, 3)).toBe(false);
    expect(isConfiguredFinalTerm("term-1", terms, 0)).toBe(false);
    expect(isConfiguredFinalTerm("term-3", terms, 4)).toBe(false);
  });

  it("requires an explicit promotion decision only for a configured final-term report", () => {
    expect(needsManualPromotionDecision({ isFinalTerm: true, calculationSnapshot: {} })).toBe(true);
    expect(needsManualPromotionDecision({ isFinalTerm: false, calculationSnapshot: {} })).toBe(false);
    expect(needsManualPromotionDecision({
      isFinalTerm: true,
      calculationSnapshot: { manualPromotionDecision: "promoted" },
    })).toBe(false);
    expect(needsManualPromotionDecision({
      isFinalTerm: true,
      calculationSnapshot: { manualPromotionDecision: "not_promoted" },
    })).toBe(false);
    expect(needsManualPromotionDecision({
      isFinalTerm: true,
      calculationSnapshot: { manualPromotionDecision: "decision_required" },
    })).toBe(true);
  });

  it("maps each bulk action to the only status it may consume", () => {
    expect(workflowStatusForAction("submit")).toBe("draft");
    expect(workflowStatusForAction("approve")).toBe("submitted");
    expect(workflowStatusForAction("release")).toBe("approved");
  });
});
