import { describe, expect, it } from "vitest";
import {
  createArgumentArenaState,
  currentArenaChallenge,
  playArenaMove,
} from "../src/lib/game-engine/argument-arena";

describe("Argument Arena", () => {
  it("changes the opening objection by side", () => {
    const support = createArgumentArenaState("support");
    const oppose = createArgumentArenaState("oppose");
    expect(currentArenaChallenge(support).type).toBe("causation");
    expect(currentArenaChallenge(oppose).type).toBe("practicality");
  });

  it("rewards evidence that is directly relevant to the chosen side", () => {
    const support = createArgumentArenaState("support", "teachers");
    const strong = playArenaMove(support, "pilot-completion", "cause", "counter-evidence");
    const weak = playArenaMove(support, "lab-capacity", "cause", "counter-evidence");
    expect(strong.exchanges[0].breakdown.relevance).toBeGreaterThan(weak.exchanges[0].breakdown.relevance);
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("penalises repeating the same source rather than allowing one-card spam", () => {
    let state = createArgumentArenaState("support", "teachers");
    state = playArenaMove(state, "pilot-completion", "cause", "counter-evidence");
    state = playArenaMove(state, "pilot-completion", "comparison", "concede-limit");
    expect(state.exchanges[0].breakdown.novelty).toBeGreaterThan(state.exchanges[1].breakdown.novelty);
  });

  it("scores rebuttals against the actual objection instead of a universal best response", () => {
    const state = createArgumentArenaState("support", "teachers");
    const direct = playArenaMove(state, "pilot-completion", "cause", "counter-evidence");
    const reframe = playArenaMove(state, "pilot-completion", "cause", "reframe");
    expect(direct.exchanges[0].breakdown.rebuttal).toBeGreaterThan(reframe.exchanges[0].breakdown.rebuttal);
  });

  it("finishes after four exchanges with a scored outcome", () => {
    let state = createArgumentArenaState("support", "teachers");
    state = playArenaMove(state, "pilot-completion", "cause", "counter-evidence");
    state = playArenaMove(state, "exhibition-output", "principle", "concede-limit");
    state = playArenaMove(state, "student-survey", "comparison", "question-source");
    state = playArenaMove(state, "assembly-belonging", "tradeoff", "reframe");
    expect(state.round).toBe(4);
    expect(state.outcome).toBeTruthy();
    expect(state.score).toBeGreaterThan(0);
    expect(state.opponentScore).toBeGreaterThan(0);
  });
});
