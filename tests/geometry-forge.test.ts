import { describe, expect, it } from "vitest";
import {
  addForgeVertex,
  countRightAngles,
  createGeometryForgeState,
  evaluateGeometryForge,
  moveForgeVertex,
  polygonArea,
  polygonPerimeter,
  polygonSelfIntersects,
  removeForgeVertex,
  submitGeometryForge,
} from "../src/lib/game-engine/geometry-forge";

describe("Geometry Forge", () => {
  it("calculates polygon area and perimeter from the constructed shape", () => {
    const rectangle = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }];
    expect(polygonArea(rectangle)).toBe(48);
    expect(polygonPerimeter(rectangle)).toBe(28);
    expect(countRightAngles(rectangle)).toBe(4);
  });

  it("starts outside the target and recognises a valid courtyard after direct construction", () => {
    let state = createGeometryForgeState("courtyard");
    expect(evaluateGeometryForge(state).complete).toBe(false);
    state = moveForgeVertex(state, 1, 12, 4);
    state = moveForgeVertex(state, 2, 12, 10);
    state = moveForgeVertex(state, 3, 4, 10);
    const evaluation = evaluateGeometryForge(state);
    expect(evaluation.area).toBe(48);
    expect(evaluation.perimeter).toBe(28);
    expect(evaluation.complete).toBe(true);
  });

  it("snaps and clamps direct vertex manipulation to the forge grid", () => {
    let state = createGeometryForgeState("courtyard");
    state = moveForgeVertex(state, 0, -2.4, 15.8);
    expect(state.points[0]).toEqual({ x: 0, y: 14 });
    expect(state.selectedVertex).toBe(0);
  });

  it("detects self-intersecting designs", () => {
    const bowTie = [{ x: 0, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }, { x: 8, y: 0 }];
    expect(polygonSelfIntersects(bowTie)).toBe(true);
  });

  it("adds a midpoint to the longest edge and allows removal above the challenge minimum", () => {
    let state = createGeometryForgeState("stage");
    state = addForgeVertex(state);
    expect(state.points).toHaveLength(5);
    const selected = state.selectedVertex;
    state = removeForgeVertex(state, selected);
    expect(state.points).toHaveLength(4);
  });

  it("keeps the best score across repeated design submissions", () => {
    let state = createGeometryForgeState("courtyard");
    state = moveForgeVertex(state, 1, 12, 4);
    state = moveForgeVertex(state, 2, 12, 10);
    state = moveForgeVertex(state, 3, 4, 10);
    state = submitGeometryForge(state);
    const firstBest = state.bestScore;
    state = moveForgeVertex(state, 0, 0, 0);
    state = submitGeometryForge(state);
    expect(state.attempts).toBe(2);
    expect(state.bestScore).toBe(firstBest);
  });
});
