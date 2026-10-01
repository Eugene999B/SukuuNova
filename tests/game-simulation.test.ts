import { describe, expect, it } from "vitest";
import { forgivingPlayerOverlap } from "../src/lib/game-engine/collision";
import { advanceFixedStep, createFixedStepState } from "../src/lib/game-engine/fixed-step";
import { createPlatformerState, stepPlatformer } from "../src/lib/game-engine/platformer-simulation";
import { applyRunnerAction, createRunnerState, stepRunner } from "../src/lib/game-engine/runner-simulation";

function runClock(frames: number[]) {
  const clock = createFixedStepState();
  let simulationSteps = 0;
  for (const frame of frames) {
    advanceFixedStep(clock, frame, () => {
      simulationSteps += 1;
    }, { maxSubsteps: 20 });
  }
  return { clock, simulationSteps };
}

describe("fixed-step simulation", () => {
  it("produces the same number of simulation steps across different render frame chunking", () => {
    const sixtyFps = runClock(Array.from({ length: 60 }, () => 1 / 60));
    const thirtyFps = runClock(Array.from({ length: 30 }, () => 1 / 30));
    expect(sixtyFps.simulationSteps).toBe(60);
    expect(thirtyFps.simulationSteps).toBe(60);
    expect(sixtyFps.clock.simulationTimeSeconds).toBeCloseTo(thirtyFps.clock.simulationTimeSeconds, 8);
  });

  it("drops extreme paused time instead of trying unlimited catch-up work", () => {
    const clock = createFixedStepState();
    const frame = advanceFixedStep(clock, 4, () => undefined, { maxFrameSeconds: 0.25, maxSubsteps: 4 });
    expect(frame.substeps).toBe(4);
    expect(clock.droppedSeconds).toBeGreaterThan(3.8);
  });
});

describe("responsive platformer", () => {
  it("allows a coyote-time jump shortly after leaving a ledge", () => {
    let state = createPlatformerState();
    state = stepPlatformer(state, { moveX: 1, jumpPressed: false, jumpHeld: false }, { grounded: true }, 1 / 60).state;
    expect(state.coyoteRemainingMs).toBeGreaterThan(0);

    const airborne = stepPlatformer(
      state,
      { moveX: 1, jumpPressed: true, jumpHeld: true },
      { grounded: false },
      1 / 60,
    );
    expect(airborne.jumped).toBe(true);
    expect(airborne.state.velocityY).toBeGreaterThan(0);
  });

  it("buffers a jump pressed just before landing", () => {
    let state = createPlatformerState({ grounded: false, y: 1, velocityY: -2 });
    state = stepPlatformer(
      state,
      { moveX: 0, jumpPressed: true, jumpHeld: true },
      { grounded: false },
      1 / 60,
    ).state;
    expect(state.jumpBufferRemainingMs).toBeGreaterThan(0);

    const landedFrame = stepPlatformer(
      state,
      { moveX: 0, jumpPressed: false, jumpHeld: true },
      { grounded: true, groundY: 0 },
      1 / 60,
    );
    expect(landedFrame.jumped).toBe(true);
    expect(landedFrame.state.velocityY).toBeGreaterThan(0);
  });

  it("cuts a released jump shorter than a held jump", () => {
    const base = createPlatformerState({ grounded: false, velocityY: 8 });
    const held = stepPlatformer(base, { moveX: 0, jumpPressed: false, jumpHeld: true }, { grounded: false }, 1 / 60).state;
    const released = stepPlatformer(base, { moveX: 0, jumpPressed: false, jumpHeld: false }, { grounded: false }, 1 / 60).state;
    expect(released.velocityY).toBeLessThan(held.velocityY);
  });
});

describe("responsive runner", () => {
  it("accepts a second lane command before the first visual transition completes", () => {
    let state = createRunnerState({ logicalLane: 2, renderedLane: 2, laneStart: 2, laneTarget: 2 });
    state = applyRunnerAction(state, "left");
    state = stepRunner(state, 0.03);
    expect(state.logicalLane).toBe(1);
    expect(state.renderedLane).not.toBe(state.logicalLane);

    const renderedBeforeRetarget = state.renderedLane;
    const retargeted = applyRunnerAction(state, "left");
    expect(retargeted.logicalLane).toBe(0);
    expect(retargeted.laneTarget).toBe(0);
    expect(retargeted.laneStart).toBeCloseTo(renderedBeforeRetarget, 8);
  });

  it("changes world pace without changing lane timing", () => {
    const base = applyRunnerAction(createRunnerState(), "left");
    const normal = stepRunner(base, 0.05, undefined, { worldSpeedScale: 1 });
    const fast = stepRunner(base, 0.05, undefined, { worldSpeedScale: 1.2 });
    expect(fast.distance).toBeGreaterThan(normal.distance);
    expect(fast.renderedLane).toBeCloseTo(normal.renderedLane, 8);
  });
});

describe("forgiving collision", () => {
  it("treats a tiny sprite-edge overlap as a near miss when forgiveness is enabled", () => {
    const player = { left: 0, top: 0, right: 10, bottom: 10 };
    const obstacle = { left: 9.5, top: 0, right: 20, bottom: 10 };
    expect(forgivingPlayerOverlap(player, obstacle, 0)).toBe(true);
    expect(forgivingPlayerOverlap(player, obstacle, 0.08)).toBe(false);
  });
});
