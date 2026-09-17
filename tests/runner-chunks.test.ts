import { describe, expect, it } from "vitest";
import {
  RUNNER_CHUNK_TEMPLATES,
  generateRunnerCourse,
  mirrorRunnerRow,
  validateRunnerChunk,
  type RunnerChunkTemplate,
} from "../src/lib/game-engine/runner-chunks";

describe("runner chunk generation", () => {
  it("keeps every built-in chunk reachable", () => {
    for (const template of RUNNER_CHUNK_TEMPLATES) {
      const validation = validateRunnerChunk(template);
      expect(validation.valid, `${template.id}: ${validation.errors.join(", ")}`).toBe(true);
      expect(validation.reachableExitLanes.length).toBeGreaterThan(0);
    }
  });

  it("rejects an impossible row that blocks all three lanes", () => {
    const impossible: RunnerChunkTemplate = {
      id: "impossible",
      length: 20,
      difficulty: 1,
      rows: [{ distance: 10, blockedLanes: [0, 1, 2], actionCue: "none" }],
    };
    const result = validateRunnerChunk(impossible);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("row_0_all_lanes_blocked");
  });

  it("generates the same course for the same seed", () => {
    const first = generateRunnerCourse("student:mission:42", 12, 0.8);
    const second = generateRunnerCourse("student:mission:42", 12, 0.8);
    expect(second).toEqual(first);
  });

  it("avoids repeating the same chunk template back-to-back when alternatives exist", () => {
    const course = generateRunnerCourse("variety-check", 30, 1);
    for (let index = 1; index < course.chunks.length; index += 1) {
      expect(course.chunks[index].templateId).not.toBe(course.chunks[index - 1].templateId);
    }
  });

  it("mirrors lane layouts without changing timing", () => {
    const row = { distance: 12, blockedLanes: [0, 1] as const, actionCue: "jump" as const, pickupLane: 2 as const };
    const mirrored = mirrorRunnerRow({ ...row, blockedLanes: [...row.blockedLanes] });
    expect(mirrored.distance).toBe(row.distance);
    expect(mirrored.actionCue).toBe(row.actionCue);
    expect(mirrored.blockedLanes).toEqual([1, 2]);
    expect(mirrored.pickupLane).toBe(0);
  });

  it("keeps low hazard density away from mastery-level chunks", () => {
    const course = generateRunnerCourse("guided-run", 25, 0.35);
    expect(Math.max(...course.chunks.map((chunk) => chunk.difficulty))).toBeLessThanOrEqual(2);
  });
});
