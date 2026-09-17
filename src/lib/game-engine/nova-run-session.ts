import { generateRunnerCourse, type RunnerActionCue, type RunnerCourse, type RunnerLane } from "./runner-chunks";
import { applyRunnerAction, createRunnerState, stepRunner, type RunnerAction, type RunnerState } from "./runner-simulation";
import type { MovementProfile } from "./types";
import { MOVEMENT_PROFILES } from "./movement-profiles";

export type NovaRunTimelineRow = {
  id: string;
  absoluteDistance: number;
  blockedLanes: RunnerLane[];
  actionCue: RunnerActionCue;
  pickupLane?: RunnerLane;
};

export type NovaRunFailureReason = "blocked-lane" | "missed-jump" | "missed-slide";

export type NovaRunEvent =
  | { type: "row-cleared"; rowId: string; scoreDelta: number; combo: number }
  | { type: "collision"; rowId: string; reason: NovaRunFailureReason; comboLost: number }
  | { type: "pickup"; rowId: string; scoreDelta: number };

export type NovaRunSession = {
  seed: string;
  course: RunnerCourse;
  timeline: NovaRunTimelineRow[];
  movement: RunnerState;
  nextRowIndex: number;
  score: number;
  combo: number;
  bestCombo: number;
  hits: number;
  pickups: number;
  finished: boolean;
};

export type NovaRunStepResult = {
  session: NovaRunSession;
  events: NovaRunEvent[];
};

export function runnerCourseTimeline(course: RunnerCourse): NovaRunTimelineRow[] {
  const timeline: NovaRunTimelineRow[] = [];
  let chunkStart = 0;
  for (const chunk of course.chunks) {
    for (let rowIndex = 0; rowIndex < chunk.rows.length; rowIndex += 1) {
      const row = chunk.rows[rowIndex];
      timeline.push({
        id: `${chunk.instanceId}:row:${rowIndex}`,
        absoluteDistance: chunkStart + row.distance,
        blockedLanes: [...row.blockedLanes],
        actionCue: row.actionCue,
        pickupLane: row.pickupLane,
      });
    }
    chunkStart += chunk.length;
  }
  return timeline.sort((a, b) => a.absoluteDistance - b.absoluteDistance);
}

export function createNovaRunSession(seed: string, options: { chunkCount?: number; hazardDensity?: number } = {}): NovaRunSession {
  const course = generateRunnerCourse(seed, options.chunkCount ?? 20, options.hazardDensity ?? 0.8);
  return {
    seed,
    course,
    timeline: runnerCourseTimeline(course),
    movement: createRunnerState(),
    nextRowIndex: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    pickups: 0,
    finished: false,
  };
}

export function applyNovaRunAction(
  previous: NovaRunSession,
  action: RunnerAction,
  profile: MovementProfile = MOVEMENT_PROFILES.arcadeRunner,
): NovaRunSession {
  if (previous.finished) return previous;
  return { ...previous, movement: applyRunnerAction(previous.movement, action, profile) };
}

function failureReason(row: NovaRunTimelineRow, movement: RunnerState): NovaRunFailureReason | null {
  if (row.blockedLanes.includes(movement.logicalLane as RunnerLane)) return "blocked-lane";
  if (row.actionCue === "jump" && movement.height < 0.38) return "missed-jump";
  if (row.actionCue === "slide" && movement.slideRemainingMs <= 0) return "missed-slide";
  return null;
}

/**
 * Advances the runner and evaluates every obstacle row crossed during the fixed
 * simulation step. Failure is recoverable: the player loses the combo and logs
 * a hit, but movement continues with the same controls.
 */
export function stepNovaRun(
  previous: NovaRunSession,
  dtSeconds: number,
  profile: MovementProfile = MOVEMENT_PROFILES.arcadeRunner,
  options: { worldSpeedScale?: number } = {},
): NovaRunStepResult {
  if (previous.finished) return { session: previous, events: [] };

  const movement = stepRunner(previous.movement, dtSeconds, profile, options);
  let nextRowIndex = previous.nextRowIndex;
  let score = previous.score;
  let combo = previous.combo;
  let bestCombo = previous.bestCombo;
  let hits = previous.hits;
  let pickups = previous.pickups;
  const events: NovaRunEvent[] = [];

  while (nextRowIndex < previous.timeline.length) {
    const row = previous.timeline[nextRowIndex];
    if (row.absoluteDistance > movement.distance) break;
    nextRowIndex += 1;

    const reason = failureReason(row, movement);
    if (reason) {
      const comboLost = combo;
      combo = 0;
      hits += 1;
      events.push({ type: "collision", rowId: row.id, reason, comboLost });
      continue;
    }

    combo += 1;
    bestCombo = Math.max(bestCombo, combo);
    const clearScore = 100 + Math.min(400, (combo - 1) * 20);
    score += clearScore;
    events.push({ type: "row-cleared", rowId: row.id, scoreDelta: clearScore, combo });

    if (row.pickupLane === movement.logicalLane) {
      const pickupScore = 35;
      score += pickupScore;
      pickups += 1;
      events.push({ type: "pickup", rowId: row.id, scoreDelta: pickupScore });
    }
  }

  const finished = nextRowIndex >= previous.timeline.length && movement.distance >= previous.course.totalLength;
  return {
    session: {
      ...previous,
      movement,
      nextRowIndex,
      score,
      combo,
      bestCombo,
      hits,
      pickups,
      finished,
    },
    events,
  };
}
