export type NovaCoreAlgorithmStatus = "production" | "beta" | "shadow" | "planned";

export type NovaCoreAlgorithm = {
  key: string;
  name: string;
  domain: "transport" | "signature" | "arcade" | "timetable" | "finance" | "platform";
  version: string;
  status: NovaCoreAlgorithmStatus;
  description: string;
  safeguards: string[];
};

export const NOVACORE_ALGORITHMS: readonly NovaCoreAlgorithm[] = [
  {
    key: "transport.gps-validation",
    name: "GPS Validation",
    domain: "transport",
    version: "1.0.0",
    status: "beta",
    description: "Rejects stale, future-dated, non-monotonic and physically implausible tracker samples before they can affect a live trip.",
    safeguards: ["coordinate bounds", "timestamp freshness", "implied-speed ceiling", "reported-speed ceiling"],
  },
  {
    key: "transport.location-smoothing",
    name: "Location Smoothing",
    domain: "transport",
    version: "1.0.0",
    status: "beta",
    description: "Smooths accepted tracker samples so the live vehicle marker is stable without hiding real movement.",
    safeguards: ["bounded smoothing coefficient", "validated input only"],
  },
  {
    key: "transport.route-deviation",
    name: "Route Deviation",
    domain: "transport",
    version: "1.0.0",
    status: "beta",
    description: "Measures a vehicle against its assigned route polyline and raises a deviation only after a configurable distance threshold.",
    safeguards: ["school-scoped route", "distance threshold", "invalid geometry rejection"],
  },
  {
    key: "transport.geofence",
    name: "Pickup Geofence State Machine",
    domain: "transport",
    version: "1.0.0",
    status: "beta",
    description: "Moves each approved pickup through outside, approaching, arriving, arrived and passed states with hysteresis and consecutive-sample confirmation.",
    safeguards: ["direction check", "hysteresis", "consecutive samples", "one-way trip states"],
  },
  {
    key: "transport.eta",
    name: "ETA Estimator",
    domain: "transport",
    version: "1.0.0",
    status: "shadow",
    description: "Blends live speed, route-segment history and route history into an ETA with an explicit uncertainty window.",
    safeguards: ["speed clamps", "missing-data fallback", "uncertainty band", "shadow rollout"],
  },
  {
    key: "transport.simulator",
    name: "Transport Digital Twin",
    domain: "transport",
    version: "1.0.0",
    status: "beta",
    description: "Creates deterministic synthetic tracker trips with GPS noise, dropouts and route deviations for repeatable certification tests.",
    safeguards: ["deterministic seed", "synthetic flag", "no production notification side effects"],
  },
  {
    key: "signature.stroke-dynamics",
    name: "Signature Stroke Dynamics",
    domain: "signature",
    version: "1.1.0",
    status: "beta",
    description: "Uses coalesced pointer events, velocity and stylus pressure to render natural variable-width electronic handwriting.",
    safeguards: ["pointer capture", "bounded width", "touch/mouse fallback", "undo and redo"],
  },
  {
    key: "signature.integrity",
    name: "Signature Integrity",
    domain: "signature",
    version: "1.0.0",
    status: "beta",
    description: "Hashes decoded signature PNG bytes with SHA-256 when a signature profile is saved so later integrity checks can detect modification.",
    safeguards: ["PNG validation", "size limit", "SHA-256", "audit trail"],
  },
  {
    key: "arcade.physics",
    name: "Arcade Deterministic Physics",
    domain: "arcade",
    version: "2.0.0",
    status: "planned",
    description: "Shared fixed-timestep rigid-body physics for only the Arcade games that genuinely require physical simulation.",
    safeguards: ["fixed timestep", "deterministic scoring", "replayable rounds", "device-independent outcomes"],
  },
  {
    key: "timetable.constraint-solver",
    name: "Timetable Constraint Solver",
    domain: "timetable",
    version: "1.0.0",
    status: "planned",
    description: "Constraint optimization for teacher, room, subject, workload, break and locked-period requirements.",
    safeguards: ["hard constraints first", "manual locks", "explainable conflicts", "human approval"],
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
