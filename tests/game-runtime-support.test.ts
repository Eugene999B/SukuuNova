import { describe, expect, it } from "vitest";
import { buildRuntimeChallengeEnvelope } from "../src/lib/game-engine/difficulty-envelope";
import { analogInputIntent, applyRadialDeadzone, keyboardInputIntent, mergeInputIntents } from "../src/lib/game-engine/input-adapter";
import { MOVEMENT_PROFILES } from "../src/lib/game-engine/movement-profiles";
import { createFramePacingState, recordFrameTime, summarizeFramePacing } from "../src/lib/game-engine/performance-monitor";

describe("input adapters", () => {
  it("removes analog stick noise inside the deadzone", () => {
    expect(applyRadialDeadzone(0.05, -0.04, 0.16)).toEqual({ x: 0, y: 0 });
  });

  it("normalizes diagonal analog movement without exceeding unit magnitude", () => {
    const intent = analogInputIntent({ moveX: 1, moveY: 1 });
    expect(Math.hypot(intent.moveX, intent.moveY)).toBeLessThanOrEqual(1.000001);
  });

  it("maps keyboard movement and edge-triggered jump separately", () => {
    const pressed = new Set(["KeyD", "Space", "ShiftLeft"]);
    const intent = keyboardInputIntent(pressed, { jumpPressed: true });
    expect(intent.moveX).toBe(1);
    expect(intent.jumpPressed).toBe(true);
    expect(intent.jumpHeld).toBe(true);
    expect(intent.sprint).toBe(true);
  });

  it("merges multiple devices by keeping the strongest axes and all discrete actions", () => {
    const keyboard = keyboardInputIntent(new Set(["KeyA"]), { interact: true });
    const controller = analogInputIntent({ moveX: 0.4, moveY: 0.8, primaryAction: true });
    const merged = mergeInputIntents(keyboard, controller);
    expect(merged.moveX).toBe(-1);
    expect(merged.moveY).toBeGreaterThan(0.7);
    expect(merged.interact).toBe(true);
    expect(merged.primaryAction).toBe(true);
  });
});

describe("adaptive gameplay envelope", () => {
  it("changes world challenge without mutating movement profiles", () => {
    const movementBefore = JSON.stringify(MOVEMENT_PROFILES.arcadeRunner);
    const envelope = buildRuntimeChallengeEnvelope({
      version: 1,
      targetDifficulty: 2,
      masteryPercent: 54,
      supportMode: "guided",
      missionMode: "reinforcement",
      speedScale: 0.84,
      hazardDensity: 0.55,
      hintStrength: 2,
      bossGate: false,
      worldKey: "aurora-causeway",
    });
    expect(envelope.resourceGenerosity).toBeGreaterThan(1);
    expect(envelope.routeComplexity).toBeLessThan(1);
    expect(envelope.hintStrength).toBe(2);
    expect(JSON.stringify(MOVEMENT_PROFILES.arcadeRunner)).toBe(movementBefore);
  });
});

describe("frame pacing monitor", () => {
  it("recommends high quality for stable 60fps pacing", () => {
    const state = createFramePacingState();
    for (let index = 0; index < 180; index += 1) recordFrameTime(state, 16.67);
    const summary = summarizeFramePacing(state);
    expect(summary.averageFps).toBeGreaterThan(59);
    expect(summary.recommendedTier).toBe("high");
  });

  it("drops quality for sustained low frame rate", () => {
    const state = createFramePacingState();
    for (let index = 0; index < 180; index += 1) recordFrameTime(state, 34);
    expect(summarizeFramePacing(state).recommendedTier).toBe("low");
  });

  it("penalizes repeated frame spikes even when many frames are fast", () => {
    const state = createFramePacingState();
    for (let index = 0; index < 100; index += 1) recordFrameTime(state, 16.67);
    for (let index = 0; index < 10; index += 1) recordFrameTime(state, 65);
    const summary = summarizeFramePacing(state);
    expect(summary.stutterRatio).toBeGreaterThan(0.08);
    expect(summary.recommendedTier).toBe("low");
  });
});
