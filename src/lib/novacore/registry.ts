import { SIGNATURE_VECTOR_VERSION } from "@/lib/signature-vector";
import { ARCADE_PHYSICS_VERSION } from "./arcade-physics";
import { TIMETABLE_OPTIMIZER_VERSION } from "./timetable-optimizer";

export type NovaCoreAlgorithmStatus = "production" | "beta" | "shadow" | "planned";
export type NovaCoreRolloutMode = "enforced" | "preview" | "shadow" | "certification" | "planned";
export type NovaCoreRisk = "low" | "medium" | "high";

export type NovaCoreAlgorithm = {
  key: string;
  name: string;
  domain: "transport" | "signature" | "arcade" | "timetable" | "finance" | "platform";
  version: string;
  status: NovaCoreAlgorithmStatus;
  rolloutMode: NovaCoreRolloutMode;
  risk: NovaCoreRisk;
  affectsUserOutcome: boolean;
  description: string;
  safeguards: string[];
  evidence: string[];
};

export const NOVACORE_ALGORITHMS: readonly NovaCoreAlgorithm[] = [
  {
    key: "transport.gps-validation",
    name: "GPS Validation",
    domain: "transport",
    version: "1.0.0",
    status: "beta",
    rolloutMode: "enforced",
    risk: "high",
    affectsUserOutcome: true,
    description: "Rejects stale, future-dated, non-monotonic and physically implausible tracker samples before they can affect a live trip.",
    safeguards: ["coordinate bounds", "timestamp freshness", "implied-speed ceiling", "reported-speed ceiling"],
    evidence: ["accepted/rejected packet ledger", "rejection reason", "tracker certification evidence"],
  },
  {
    key: "transport.location-smoothing",
    name: "Location Smoothing",
    domain: "transport",
    version: "1.0.0",
    status: "beta",
    rolloutMode: "enforced",
    risk: "high",
    affectsUserOutcome: true,
    description: "Smooths accepted tracker samples so the live vehicle marker is stable without hiding real movement.",
    safeguards: ["bounded smoothing coefficient", "validated input only", "raw coordinate retained"],
    evidence: ["raw position", "normalized position", "algorithm version"],
  },
  {
    key: "transport.route-matching",
    name: "Route Matcher",
    domain: "transport",
    version: "1.0.0",
    status: "beta",
    rolloutMode: "enforced",
    risk: "high",
    affectsUserOutcome: true,
    description: "Projects validated vehicle positions onto the active directional route and measures progress, remaining distance, confidence and deviation.",
    safeguards: ["direction-specific geometry", "school-scoped route", "confidence score", "raw location retained"],
    evidence: ["route progress", "route remaining distance", "route-match confidence", "deviation meters"],
  },
  {
    key: "transport.geofence",
    name: "Pickup Geofence State Machine",
    domain: "transport",
    version: "1.1.0",
    status: "beta",
    rolloutMode: "enforced",
    risk: "high",
    affectsUserOutcome: true,
    description: "Moves each approved pickup through outside, approaching, arriving, arrived and passed states using route progress, hysteresis and consecutive-sample confirmation.",
    safeguards: ["route-aware distance", "direction check", "hysteresis", "consecutive samples", "idempotent alerts", "one-way trip states"],
    evidence: ["previous/current state", "route remaining meters", "ETA", "prediction version"],
  },
  {
    key: "transport.eta",
    name: "ETA Estimator",
    domain: "transport",
    version: "1.0.0",
    status: "shadow",
    rolloutMode: "shadow",
    risk: "high",
    affectsUserOutcome: false,
    description: "Blends route remaining distance and filtered live speed into an ETA with an explicit uncertainty window while candidate improvements can run in shadow mode.",
    safeguards: ["speed clamps", "missing-data fallback", "uncertainty band", "shadow rollout"],
    evidence: ["ETA minutes", "confidence minutes", "route remaining meters", "prediction version"],
  },
  {
    key: "transport.simulator",
    name: "Transport Digital Twin",
    domain: "transport",
    version: "1.0.0",
    status: "beta",
    rolloutMode: "certification",
    risk: "low",
    affectsUserOutcome: false,
    description: "Creates deterministic synthetic tracker trips with GPS noise, dropouts and route deviations for repeatable certification tests.",
    safeguards: ["deterministic seed", "synthetic flag", "no production notification side effects"],
    evidence: ["scenario seed", "simulated packet stream", "expected alert sequence"],
  },
  {
    key: "signature.stroke-dynamics",
    name: "Signature Stroke Dynamics",
    domain: "signature",
    version: SIGNATURE_VECTOR_VERSION,
    status: "beta",
    rolloutMode: "enforced",
    risk: "medium",
    affectsUserOutcome: true,
    description: "Uses coalesced pointer events, smoothed velocity and stylus pressure to render and replay natural variable-width electronic handwriting.",
    safeguards: ["normalized coordinates", "bounded pressure and width", "oversized-touch guard", "undo/redo", "legacy PNG fallback"],
    evidence: ["vector stroke points", "relative timing", "pointer type", "pressure", "stroke count"],
  },
  {
    key: "signature.integrity",
    name: "Signature Integrity & Document Binding",
    domain: "signature",
    version: "2.0.0",
    status: "beta",
    rolloutMode: "enforced",
    risk: "high",
    affectsUserOutcome: true,
    description: "Separately hashes PNG and canonical vector evidence, then binds a verified signature version to an issued document using keyed HMAC-SHA-256.",
    safeguards: ["PNG validation", "vector bounds", "SHA-256 evidence hashes", "HMAC-SHA-256 document binding", "timing-safe verification", "audit trail"],
    evidence: ["image SHA-256", "vector SHA-256", "document binding HMAC", "signature version timestamp"],
  },
  {
    key: "arcade.physics",
    name: "Arcade Deterministic Physics",
    domain: "arcade",
    version: ARCADE_PHYSICS_VERSION,
    status: "beta",
    rolloutMode: "enforced",
    risk: "medium",
    affectsUserOutcome: true,
    description: "Runs fixed-timestep force, impulse, damping and collision simulation for Arcade games that genuinely require physical behavior; Force & Motion Lab is the first live consumer.",
    safeguards: ["fixed timestep", "bounded catch-up", "deterministic body ordering", "device-independent outcomes", "static content fallback"],
    evidence: ["simulation version", "mass", "force", "elapsed time", "measured speed/displacement"],
  },
  {
    key: "timetable.constraint-solver",
    name: "Timetable Constraint Solver",
    domain: "timetable",
    version: TIMETABLE_OPTIMIZER_VERSION,
    status: "beta",
    rolloutMode: "preview",
    risk: "high",
    affectsUserOutcome: false,
    description: "Deterministic constraint search for teacher, class, room, availability, double-period, daily-limit and locked-period requirements.",
    safeguards: ["preview-only", "hard constraints first", "manual locks", "search-node ceiling", "explainable conflicts", "existing writer remains authoritative"],
    evidence: ["candidate placements", "nodes visited", "constraint reasons", "quality comparison"],
  },
] as const;

export type ShadowComparison = {
  samples: number;
  currentMae: number | null;
  candidateMae: number | null;
  candidateImprovementPercent: number | null;
  candidateWins: boolean | null;
};

export function compareShadowPredictions(
  rows: Array<{ actual: number; current: number; candidate: number }>,
): ShadowComparison {
  const valid = rows.filter((row) => [row.actual, row.current, row.candidate].every(Number.isFinite));
  if (!valid.length) {
    return { samples: 0, currentMae: null, candidateMae: null, candidateImprovementPercent: null, candidateWins: null };
  }
  const currentMae = valid.reduce((sum, row) => sum + Math.abs(row.actual - row.current), 0) / valid.length;
  const candidateMae = valid.reduce((sum, row) => sum + Math.abs(row.actual - row.candidate), 0) / valid.length;
  const improvement = currentMae === 0 ? (candidateMae === 0 ? 0 : -100) : (currentMae - candidateMae) / currentMae * 100;
  return {
    samples: valid.length,
    currentMae: Math.round(currentMae * 100) / 100,
    candidateMae: Math.round(candidateMae * 100) / 100,
    candidateImprovementPercent: Math.round(improvement * 100) / 100,
    candidateWins: candidateMae < currentMae,
  };
}

export function novaCoreRegistrySummary() {
  const algorithms = [...NOVACORE_ALGORITHMS];
  const byStatus = algorithms.reduce<Record<NovaCoreAlgorithmStatus, number>>((counts, algorithm) => {
    counts[algorithm.status] += 1;
    return counts;
  }, { production: 0, beta: 0, shadow: 0, planned: 0 });
  const highRisk = algorithms.filter((algorithm) => algorithm.risk === "high");
  return {
    generatedAt: new Date().toISOString(),
    algorithmCount: algorithms.length,
    byStatus,
    highRiskCount: highRisk.length,
    userOutcomeAlgorithms: algorithms.filter((algorithm) => algorithm.affectsUserOutcome).length,
    algorithms,
  };
}