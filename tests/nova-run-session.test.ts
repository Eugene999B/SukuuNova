import { describe, expect, it } from "vitest";
import { applyNovaRunAction, createNovaRunSession, stepNovaRun, type NovaRunSession } from "../src/lib/game-engine/nova-run-session";

function withRows(session: NovaRunSession, rows: NovaRunSession["timeline"]): NovaRunSession {
  return {
    ...session,
    timeline: rows,
    nextRowIndex: 0,
    course: { ...session.course, totalLength: 20 },
  };
}

describe("Nova Run session", () => {
  it("builds a deterministic scored course", () => {
    const first = createNovaRunSession("learner:mission:1", { chunkCount: 8, hazardDensity: 0.7 });
    const second = createNovaRunSession("learner:mission:1", { chunkCount: 8, hazardDensity: 0.7 });
    expect(second.timeline).toEqual(first.timeline);
    expect(first.score).toBe(0);
    expect(first.hits).toBe(0);
  });

  it("awards clear and pickup points without pausing movement", () => {
    let session = withRows(createNovaRunSession("score"), [
      { id: "row", absoluteDistance: 0.1, blockedLanes: [0], actionCue: "none", pickupLane: 1 },
    ]);
    const result = stepNovaRun(session, 0.02);
    session = result.session;
    expect(session.score).toBe(135);
    expect(session.combo).toBe(1);
    expect(session.pickups).toBe(1);
    expect(session.movement.distance).toBeGreaterThan(0.1);
    expect(result.events.map((event) => event.type)).toEqual(["row-cleared", "pickup"]);
  });

  it("uses recoverable collisions instead of ending the run", () => {
    const session = withRows({ ...createNovaRunSession("collision"), combo: 4 }, [
      { id: "blocked", absoluteDistance: 0.1, blockedLanes: [1], actionCue: "none" },
    ]);
    const result = stepNovaRun(session, 0.02);
    expect(result.session.hits).toBe(1);
    expect(result.session.combo).toBe(0);
    expect(result.session.finished).toBe(false);
    expect(result.events[0]).toMatchObject({ type: "collision", reason: "blocked-lane", comboLost: 4 });
  });

  it("recognises a jump performed before a jump-action row", () => {
    let session = withRows(createNovaRunSession("jump"), [
      { id: "jump", absoluteDistance: 0.4, blockedLanes: [], actionCue: "jump" },
    ]);
    session = applyNovaRunAction(session, "jump");
    const result = stepNovaRun(session, 0.05);
    expect(result.session.hits).toBe(0);
    expect(result.session.combo).toBe(1);
    expect(result.events[0]?.type).toBe("row-cleared");
  });

  it("recognises a slide without changing lane controls", () => {
    let session = withRows(createNovaRunSession("slide"), [
      { id: "slide", absoluteDistance: 0.1, blockedLanes: [], actionCue: "slide" },
    ]);
    const laneBefore = session.movement.logicalLane;
    session = applyNovaRunAction(session, "slide");
    const result = stepNovaRun(session, 0.02);
    expect(result.session.hits).toBe(0);
    expect(result.session.movement.logicalLane).toBe(laneBefore);
    expect(result.session.movement.slideRemainingMs).toBeGreaterThan(0);
  });
});
