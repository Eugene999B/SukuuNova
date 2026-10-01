import { MOVEMENT_PROFILES } from "./movement-profiles";
import type { MovementProfile } from "./types";

export type RunnerAction = "left" | "right" | "jump" | "slide";

export type RunnerState = {
  logicalLane: number;
  renderedLane: number;
  laneStart: number;
  laneTarget: number;
  laneTransitionElapsedMs: number;
  height: number;
  verticalVelocity: number;
  grounded: boolean;
  jumpBufferRemainingMs: number;
  slideRemainingMs: number;
  distance: number;
  elapsedMs: number;
};

export type RunnerStepOptions = {
  worldSpeedScale?: number;
  groundHeight?: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function runnerProfileValues(profile: MovementProfile) {
  const laneCount = Math.max(2, Math.trunc(profile.laneCount ?? 3));
  const laneChangeDurationMs = Math.max(60, profile.laneChangeDurationMs ?? 150);
  const speed = Math.max(0, profile.autoForwardSpeed ?? profile.maxSpeed);
  const gravity = Math.max(0, profile.gravity ?? 24);
  const jumpVelocity = Math.max(0, profile.jumpVelocity ?? 9.5);
  return { laneCount, laneChangeDurationMs, speed, gravity, jumpVelocity };
}

export function createRunnerState(
  input: Partial<RunnerState> = {},
  profile: MovementProfile = MOVEMENT_PROFILES.arcadeRunner,
): RunnerState {
  const { laneCount } = runnerProfileValues(profile);
  const middle = Math.floor(laneCount / 2);
  const logicalLane = clamp(Math.trunc(input.logicalLane ?? middle), 0, laneCount - 1);
  const renderedLane = clamp(input.renderedLane ?? logicalLane, 0, laneCount - 1);
  return {
    logicalLane,
    renderedLane,
    laneStart: input.laneStart ?? renderedLane,
    laneTarget: input.laneTarget ?? logicalLane,
    laneTransitionElapsedMs: input.laneTransitionElapsedMs ?? 0,
    height: Math.max(0, input.height ?? 0),
    verticalVelocity: input.verticalVelocity ?? 0,
    grounded: input.grounded ?? true,
    jumpBufferRemainingMs: Math.max(0, input.jumpBufferRemainingMs ?? 0),
    slideRemainingMs: Math.max(0, input.slideRemainingMs ?? 0),
    distance: Math.max(0, input.distance ?? 0),
    elapsedMs: Math.max(0, input.elapsedMs ?? 0),
  };
}

/**
 * Applies discrete player intent immediately to the logical state. The rendered
 * lane may still be tweening. If another lane input arrives before the animation
 * finishes, it uses the logical lane as its source, which keeps rapid expert
 * input responsive instead of waiting for animation completion.
 */
export function applyRunnerAction(
  previous: RunnerState,
  action: RunnerAction,
  profile: MovementProfile = MOVEMENT_PROFILES.arcadeRunner,
): RunnerState {
  const { laneCount } = runnerProfileValues(profile);
  const next = { ...previous };

  if (action === "left" || action === "right") {
    const delta = action === "left" ? -1 : 1;
    const target = clamp(previous.logicalLane + delta, 0, laneCount - 1);
    if (target !== previous.logicalLane) {
      next.logicalLane = target;
      next.laneStart = previous.renderedLane;
      next.laneTarget = target;
      next.laneTransitionElapsedMs = 0;
    }
    return next;
  }

  if (action === "jump") {
    next.jumpBufferRemainingMs = Math.max(0, profile.jumpBufferMs ?? 90);
    return next;
  }

  if (action === "slide" && previous.grounded) {
    next.slideRemainingMs = 600;
  }
  return next;
}

export function stepRunner(
  previous: RunnerState,
  dtSeconds: number,
  profile: MovementProfile = MOVEMENT_PROFILES.arcadeRunner,
  options: RunnerStepOptions = {},
): RunnerState {
  const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
  const dtMs = dt * 1000;
  const { laneChangeDurationMs, speed, gravity, jumpVelocity } = runnerProfileValues(profile);
  const worldSpeedScale = clamp(options.worldSpeedScale ?? 1, 0.5, 1.5);
  const groundHeight = Math.max(0, options.groundHeight ?? 0);

  let laneTransitionElapsedMs = previous.laneTransitionElapsedMs;
  let renderedLane = previous.renderedLane;
  if (Math.abs(previous.renderedLane - previous.laneTarget) > 0.0001) {
    laneTransitionElapsedMs += dtMs;
    const progress = easeOutCubic(laneTransitionElapsedMs / laneChangeDurationMs);
    renderedLane = previous.laneStart + (previous.laneTarget - previous.laneStart) * progress;
    if (laneTransitionElapsedMs >= laneChangeDurationMs) renderedLane = previous.laneTarget;
  }

  let jumpBufferRemainingMs = Math.max(0, previous.jumpBufferRemainingMs - dtMs);
  let verticalVelocity = previous.verticalVelocity;
  let height = previous.height;
  let grounded = previous.grounded;

  if (jumpBufferRemainingMs > 0 && grounded) {
    verticalVelocity = jumpVelocity;
    grounded = false;
    jumpBufferRemainingMs = 0;
  }

  if (!grounded) {
    const gravityScale = verticalVelocity < 0 ? Math.max(1, profile.fallGravityMultiplier ?? 1) : 1;
    verticalVelocity -= gravity * gravityScale * dt;
    height += verticalVelocity * dt;
    if (height <= groundHeight) {
      height = groundHeight;
      verticalVelocity = 0;
      grounded = true;
    }
  } else {
    height = groundHeight;
    verticalVelocity = 0;
  }

  return {
    ...previous,
    renderedLane,
    laneTransitionElapsedMs,
    height,
    verticalVelocity,
    grounded,
    jumpBufferRemainingMs,
    slideRemainingMs: Math.max(0, previous.slideRemainingMs - dtMs),
    distance: previous.distance + speed * worldSpeedScale * dt,
    elapsedMs: previous.elapsedMs + dtMs,
  };
}
