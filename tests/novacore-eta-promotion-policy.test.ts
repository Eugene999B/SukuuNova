import { describe, expect, it } from "vitest";
import { ETA_PROMOTION_GATES, evaluateEtaPromotionReadiness } from "../src/lib/novacore/eta-promotion-policy";

describe("NovaCore ETA promotion policy", () => {
  it("keeps low-sample evidence in shadow collection", () => {
    const result = evaluateEtaPromotionReadiness({
      samples: 25,
      maeMinutes: 2,
      medianErrorMinutes: 1.5,
      p90ErrorMinutes: 5,
      within5MinutesRate: 0.95,
      withinConfidenceRate: 0.9,
    });
    expect(result.status).toBe("insufficient_evidence");
    expect(result.remainingSamples).toBe(ETA_PROMOTION_GATES.minimumEvaluatedPredictions - 25);
    expect(result.automaticPromotionAllowed).toBe(false);
  });

  it("holds a mature sample when quality gates fail", () => {
    const result = evaluateEtaPromotionReadiness({
      samples: 250,
      maeMinutes: 6.2,
      medianErrorMinutes: 4.2,
      p90ErrorMinutes: 13,
      within5MinutesRate: 0.62,
      withinConfidenceRate: 0.58,
    });
    expect(result.status).toBe("hold");
    expect(result.failedGates).toContain("mae");
    expect(result.failedGates).toContain("p90_error");
    expect(result.automaticPromotionAllowed).toBe(false);
  });

  it("marks strong mature evidence review-ready but never auto-promotes", () => {
    const result = evaluateEtaPromotionReadiness({
      samples: 400,
      maeMinutes: 2.5,
      medianErrorMinutes: 2,
      p90ErrorMinutes: 6.5,
      within5MinutesRate: 0.9,
      withinConfidenceRate: 0.83,
    });
    expect(result.status).toBe("review_ready");
    expect(result.failedGates).toEqual([]);
    expect(result.automaticPromotionAllowed).toBe(false);
  });
});
