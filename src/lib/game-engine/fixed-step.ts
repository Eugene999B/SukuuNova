import { FIXED_SIMULATION_HZ } from "./movement-profiles";

export type FixedStepState = {
  accumulatorSeconds: number;
  simulationTimeSeconds: number;
  totalSteps: number;
  droppedSeconds: number;
};

export type FixedStepOptions = {
  hz?: number;
  maxFrameSeconds?: number;
  maxSubsteps?: number;
};

export type FixedStepFrame = {
  substeps: number;
  interpolationAlpha: number;
  fixedDtSeconds: number;
  clampedFrameSeconds: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function createFixedStepState(): FixedStepState {
  return {
    accumulatorSeconds: 0,
    simulationTimeSeconds: 0,
    totalSteps: 0,
    droppedSeconds: 0,
  };
}

/**
 * Advances gameplay on a stable simulation clock even when render frames arrive
 * unevenly. A frame clamp and max-substep guard prevent a long browser pause from
 * creating a "spiral of death" where simulation can never catch up.
 */
export function advanceFixedStep(
  state: FixedStepState,
  elapsedSeconds: number,
  update: (fixedDtSeconds: number) => void,
  options: FixedStepOptions = {},
): FixedStepFrame {
  const hz = clamp(Math.trunc(options.hz ?? FIXED_SIMULATION_HZ), 15, 240);
  const fixedDtSeconds = 1 / hz;
  const maxFrameSeconds = clamp(options.maxFrameSeconds ?? 0.25, fixedDtSeconds, 1);
  const maxSubsteps = clamp(Math.trunc(options.maxSubsteps ?? 8), 1, 30);
  const safeElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const clampedFrameSeconds = Math.min(safeElapsed, maxFrameSeconds);

  if (safeElapsed > clampedFrameSeconds) state.droppedSeconds += safeElapsed - clampedFrameSeconds;
  state.accumulatorSeconds += clampedFrameSeconds;

  let substeps = 0;
  const epsilon = 1e-9;
  while (state.accumulatorSeconds + epsilon >= fixedDtSeconds && substeps < maxSubsteps) {
    update(fixedDtSeconds);
    state.accumulatorSeconds -= fixedDtSeconds;
    if (Math.abs(state.accumulatorSeconds) < epsilon) state.accumulatorSeconds = 0;
    state.simulationTimeSeconds += fixedDtSeconds;
    state.totalSteps += 1;
    substeps += 1;
  }

  if (state.accumulatorSeconds + epsilon >= fixedDtSeconds) {
    const wholeStepsBehind = Math.floor((state.accumulatorSeconds + epsilon) / fixedDtSeconds);
    const dropped = wholeStepsBehind * fixedDtSeconds;
    state.accumulatorSeconds -= dropped;
    state.droppedSeconds += dropped;
  }

  return {
    substeps,
    interpolationAlpha: clamp(state.accumulatorSeconds / fixedDtSeconds, 0, 0.999999),
    fixedDtSeconds,
    clampedFrameSeconds,
  };
}
