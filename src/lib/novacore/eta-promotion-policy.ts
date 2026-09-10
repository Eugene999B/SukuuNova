export const ETA_PROMOTION_POLICY_VERSION = "eta-shadow-promotion-v1.0.0";

export const ETA_PROMOTION_GATES = {
  minimumEvaluatedPredictions: 100,
  maximumMaeMinutes: 4,
  maximumMedianErrorMinutes: 3,
  maximumP90ErrorMinutes: 9,
  minimumWithin5MinutesRate: 0.8,
  minimumWithinConfidenceRate: 0.75,
} as const;

export type EtaAccuracyEvidence = {
  samples: number;
  maeMinutes: number | null;
  medianErrorMinutes: number | null;
  p90ErrorMinutes: number | null;
  within5MinutesRate: number | null;
  withinConfidenceRate: number | null;
};

export type EtaPromotionReadiness = {
  policyVersion: string;
  status: "insufficient_evidence" | "hold" | "review_ready";
  automaticPromotionAllowed: false;
  passedGates: string[];
  failedGates: string[];
  remainingSamples: number;
};

export function evaluateEtaPromotionReadiness(evidence: EtaAccuracyEvidence): EtaPromotionReadiness {
  const passedGates: string[] = [];
  const failedGates: string[] = [];
  const remainingSamples = Math.max(0, ETA_PROMOTION_GATES.minimumEvaluatedPredictions - Math.max(0, Math.floor(evidence.samples)));

  if (evidence.samples >= ETA_PROMOTION_GATES.minimumEvaluatedPredictions) passedGates.push("minimum_samples");
  else failedGates.push("minimum_samples");

  const metric = (name: string, value: number | null, passes: (value: number) => boolean) => {
    if (value != null && Number.isFinite(value) && passes(value)) passedGates.push(name);
    else failedGates.push(name);
  };
  metric("mae", evidence.maeMinutes, (value) => value <= ETA_PROMOTION_GATES.maximumMaeMinutes);
  metric("median_error", evidence.medianErrorMinutes, (value) => value <= ETA_PROMOTION_GATES.maximumMedianErrorMinutes);
  metric("p90_error", evidence.p90ErrorMinutes, (value) => value <= ETA_PROMOTION_GATES.maximumP90ErrorMinutes);
  metric("within_5_minutes", evidence.within5MinutesRate, (value) => value >= ETA_PROMOTION_GATES.minimumWithin5MinutesRate);
  metric("confidence_coverage", evidence.withinConfidenceRate, (value) => value >= ETA_PROMOTION_GATES.minimumWithinConfidenceRate);

  const status: EtaPromotionReadiness["status"] = remainingSamples > 0
    ? "insufficient_evidence"
    : failedGates.length
      ? "hold"
      : "review_ready";

  return {
    policyVersion: ETA_PROMOTION_POLICY_VERSION,
    status,
    automaticPromotionAllowed: false,
    passedGates,
    failedGates,
    remainingSamples,
  };
}
