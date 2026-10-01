export type RunnerLane = 0 | 1 | 2;
export type RunnerActionCue = "none" | "jump" | "slide";

export type RunnerChunkRow = {
  distance: number;
  blockedLanes: RunnerLane[];
  actionCue: RunnerActionCue;
  pickupLane?: RunnerLane;
};

export type RunnerChunkTemplate = {
  id: string;
  length: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  rows: RunnerChunkRow[];
};

export type RunnerChunkInstance = {
  instanceId: string;
  templateId: string;
  length: number;
  difficulty: RunnerChunkTemplate["difficulty"];
  mirrored: boolean;
  rows: RunnerChunkRow[];
};

export type RunnerCourse = {
  seed: string;
  chunks: RunnerChunkInstance[];
  totalLength: number;
};

const LANES: RunnerLane[] = [0, 1, 2];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mirrorLane = (lane: RunnerLane): RunnerLane => (2 - lane) as RunnerLane;

function stableHash(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

function createRandom(seed: string) {
  let state = stableHash(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export const RUNNER_CHUNK_TEMPLATES: RunnerChunkTemplate[] = [
  {
    id: "single-read",
    length: 28,
    difficulty: 1,
    rows: [
      { distance: 9, blockedLanes: [0], actionCue: "none", pickupLane: 1 },
      { distance: 20, blockedLanes: [2], actionCue: "none", pickupLane: 1 },
    ],
  },
  {
    id: "gentle-weave",
    length: 34,
    difficulty: 2,
    rows: [
      { distance: 8, blockedLanes: [0], actionCue: "none", pickupLane: 2 },
      { distance: 18, blockedLanes: [2], actionCue: "none", pickupLane: 0 },
      { distance: 29, blockedLanes: [0], actionCue: "none", pickupLane: 1 },
    ],
  },
  {
    id: "jump-window",
    length: 36,
    difficulty: 2,
    rows: [
      { distance: 8, blockedLanes: [], actionCue: "jump", pickupLane: 1 },
      { distance: 22, blockedLanes: [1], actionCue: "none", pickupLane: 2 },
      { distance: 31, blockedLanes: [], actionCue: "jump", pickupLane: 0 },
    ],
  },
  {
    id: "slide-and-shift",
    length: 40,
    difficulty: 3,
    rows: [
      { distance: 8, blockedLanes: [], actionCue: "slide", pickupLane: 1 },
      { distance: 20, blockedLanes: [0, 1], actionCue: "none", pickupLane: 2 },
      { distance: 33, blockedLanes: [2], actionCue: "none", pickupLane: 1 },
    ],
  },
  {
    id: "double-choice",
    length: 42,
    difficulty: 3,
    rows: [
      { distance: 9, blockedLanes: [1], actionCue: "none", pickupLane: 0 },
      { distance: 20, blockedLanes: [0], actionCue: "jump", pickupLane: 2 },
      { distance: 33, blockedLanes: [2], actionCue: "slide", pickupLane: 1 },
    ],
  },
  {
    id: "precision-switch",
    length: 46,
    difficulty: 4,
    rows: [
      { distance: 8, blockedLanes: [0, 1], actionCue: "none", pickupLane: 2 },
      { distance: 21, blockedLanes: [1, 2], actionCue: "none", pickupLane: 0 },
      { distance: 35, blockedLanes: [0, 1], actionCue: "jump", pickupLane: 2 },
    ],
  },
  {
    id: "mixed-mastery",
    length: 52,
    difficulty: 5,
    rows: [
      { distance: 8, blockedLanes: [2], actionCue: "jump", pickupLane: 0 },
      { distance: 20, blockedLanes: [0, 1], actionCue: "none", pickupLane: 2 },
      { distance: 33, blockedLanes: [], actionCue: "slide", pickupLane: 1 },
      { distance: 45, blockedLanes: [1, 2], actionCue: "jump", pickupLane: 0 },
    ],
  },
];

export function mirrorRunnerRow(row: RunnerChunkRow): RunnerChunkRow {
  return {
    ...row,
    blockedLanes: row.blockedLanes.map(mirrorLane).sort((a, b) => a - b),
    pickupLane: row.pickupLane === undefined ? undefined : mirrorLane(row.pickupLane),
  };
}

export function validateRunnerChunk(template: RunnerChunkTemplate, minimumLaneChangeDistance = 5) {
  const errors: string[] = [];
  if (!(template.length > 0)) errors.push("chunk_length_invalid");
  if (!template.rows.length) errors.push("chunk_has_no_rows");

  let reachable = new Set<RunnerLane>(LANES);
  let previousDistance = 0;
  const rows = [...template.rows].sort((a, b) => a.distance - b.distance);

  rows.forEach((row, index) => {
    if (row.distance <= previousDistance || row.distance >= template.length) errors.push(`row_${index}_distance_invalid`);
    const blocked = new Set(row.blockedLanes);
    if (blocked.size !== row.blockedLanes.length) errors.push(`row_${index}_duplicate_lane`);
    if (blocked.size >= LANES.length) errors.push(`row_${index}_all_lanes_blocked`);
    if (row.blockedLanes.some((lane) => !LANES.includes(lane))) errors.push(`row_${index}_lane_invalid`);

    const distanceDelta = Math.max(0, row.distance - previousDistance);
    const maximumLaneChanges = Math.max(0, Math.floor(distanceDelta / Math.max(1, minimumLaneChangeDistance)));
    const nextReachable = new Set<RunnerLane>();
    for (const lane of LANES) {
      if (blocked.has(lane)) continue;
      for (const from of reachable) {
        if (Math.abs(lane - from) <= maximumLaneChanges) {
          nextReachable.add(lane);
          break;
        }
      }
    }
    if (!nextReachable.size) errors.push(`row_${index}_unreachable`);
    reachable = nextReachable;
    previousDistance = row.distance;
  });

  return { valid: errors.length === 0, errors, reachableExitLanes: [...reachable].sort((a, b) => a - b) };
}

export function instantiateRunnerChunk(template: RunnerChunkTemplate, instanceIndex: number, mirrored: boolean): RunnerChunkInstance {
  const rows = template.rows.map((row) => mirrored ? mirrorRunnerRow(row) : { ...row, blockedLanes: [...row.blockedLanes] });
  return {
    instanceId: `${template.id}:${instanceIndex}:${mirrored ? "m" : "n"}`,
    templateId: template.id,
    length: template.length,
    difficulty: template.difficulty,
    mirrored,
    rows,
  };
}

/**
 * Builds a deterministic course from vetted modular chunks. Hazard density
 * controls which difficulty bands are eligible; it does not alter input timing.
 */
export function generateRunnerCourse(seed: string, chunkCount: number, hazardDensity = 0.8): RunnerCourse {
  const count = clamp(Math.trunc(chunkCount), 1, 100);
  const density = clamp(hazardDensity, 0.35, 1.2);
  const maxDifficulty = clamp(Math.ceil(density * 4.2), 1, 5);
  const eligible = RUNNER_CHUNK_TEMPLATES.filter((template) => template.difficulty <= maxDifficulty);
  const random = createRandom(seed);
  const chunks: RunnerChunkInstance[] = [];
  let previousTemplateId = "";

  for (let index = 0; index < count; index += 1) {
    let candidates = eligible.filter((template) => template.id !== previousTemplateId);
    if (!candidates.length) candidates = eligible;
    const template = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
    const mirrored = random() >= 0.5;
    const instance = instantiateRunnerChunk(template, index, mirrored);
    const validation = validateRunnerChunk(template);
    if (!validation.valid) throw new Error(`Invalid runner chunk ${template.id}: ${validation.errors.join(", ")}`);
    chunks.push(instance);
    previousTemplateId = template.id;
  }

  return {
    seed,
    chunks,
    totalLength: chunks.reduce((total, chunk) => total + chunk.length, 0),
  };
}
