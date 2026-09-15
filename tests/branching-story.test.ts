import { describe, expect, it } from "vitest";
import { ARCHIVE_CASE } from "../src/lib/game-engine/archive-case";
import {
  availableStoryChoices,
  chooseStoryOption,
  continueStory,
  createBranchingStoryState,
  currentStoryNode,
  restoreStoryCheckpoint,
  serializeStoryCheckpoint,
  validateBranchingStory,
  type BranchingStoryDefinition,
} from "../src/lib/game-engine/branching-story";

function choose(state: ReturnType<typeof createBranchingStoryState>, choiceId: string) {
  return chooseStoryOption(ARCHIVE_CASE, state, choiceId).state;
}

function collect(state: ReturnType<typeof createBranchingStoryState>, choiceId: string) {
  const source = choose(state, choiceId);
  return continueStory(ARCHIVE_CASE, source).state;
}

describe("branching story runtime", () => {
  it("validates references before a story starts", () => {
    const broken: BranchingStoryDefinition = {
      id: "broken",
      version: 1,
      title: "Broken",
      startNodeId: "missing",
      nodes: [{ id: "only", title: "Only", body: "No start node", nextNodeId: "also-missing" }],
    };
    const validation = validateBranchingStory(broken);
    expect(validation.valid).toBe(false);
    expect(validation.problems.length).toBeGreaterThanOrEqual(2);
  });

  it("supports nonlinear evidence collection and removes already collected source choices", () => {
    let state = createBranchingStoryState(ARCHIVE_CASE);
    state = choose(state, "enter");
    expect(currentStoryNode(ARCHIVE_CASE, state).id).toBe("hub");

    state = collect(state, "newspaper-room");
    expect(state.evidenceIds).toContain("editorial");
    expect(availableStoryChoices(ARCHIVE_CASE, state).map((choice) => choice.id)).not.toContain("newspaper-room");

    state = collect(state, "engineering-file");
    expect(state.evidenceIds).toEqual(expect.arrayContaining(["editorial", "engineer-memo"]));
  });

  it("unlocks an evidence-supported ending only after its required sources are found", () => {
    let state = createBranchingStoryState(ARCHIVE_CASE);
    state = choose(state, "enter");
    state = collect(state, "engineering-file");
    state = collect(state, "photo-drawer");
    state = collect(state, "watch-station");
    state = choose(state, "interpret");

    const choices = availableStoryChoices(ARCHIVE_CASE, state).map((choice) => choice.id);
    expect(choices).toContain("threshold");
    expect(choices).not.toContain("systemic");

    state = choose(state, "threshold");
    expect(state.endingId).toBe("threshold-supported");
    expect(currentStoryNode(ARCHIVE_CASE, state).title).toContain("Immediate cause");
  });

  it("allows a cautious ending without pretending incomplete evidence proves a single answer", () => {
    let state = createBranchingStoryState(ARCHIVE_CASE);
    state = choose(state, "enter");
    state = choose(state, "interpret");
    state = choose(state, "insufficient");
    expect(state.endingId).toBe("cautious-provisional");
  });

  it("serializes and restores the exact investigation checkpoint", () => {
    let state = createBranchingStoryState(ARCHIVE_CASE);
    state = choose(state, "enter");
    state = collect(state, "council-shelf");
    state = collect(state, "interview-room");

    const checkpoint = serializeStoryCheckpoint(state);
    const restored = restoreStoryCheckpoint(ARCHIVE_CASE, checkpoint);
    expect(restored.restored).toBe(true);
    expect(restored.state).toEqual(state);
  });

  it("falls back to a clean start when a checkpoint is incompatible", () => {
    const restored = restoreStoryCheckpoint(ARCHIVE_CASE, JSON.stringify({ schemaVersion: 99, state: { storyId: ARCHIVE_CASE.id } }));
    expect(restored.restored).toBe(false);
    expect(restored.reason).toBe("invalid");
    expect(restored.state.nodeId).toBe(ARCHIVE_CASE.startNodeId);
  });
});
