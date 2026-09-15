import { describe, expect, it } from "vitest";
import { simulateTruss, type StructuralModel } from "../src/lib/game-engine/structural-simulation";

function axialBar(loadX: number, yieldStrength = 250e6): StructuralModel {
  return {
    nodes: [
      { id: "A", x: 0, y: 0, fixedX: true, fixedY: true },
      { id: "B", x: 1, y: 0, fixedY: true, loadX },
    ],
    members: [
      { id: "AB", nodeA: "A", nodeB: "B", area: 0.01, youngModulus: 200e9, yieldStrength },
    ],
  };
}

describe("structural simulation", () => {
  it("matches the analytical displacement and stress of a simple axial bar", () => {
    const result = simulateTruss(axialBar(1000));
    expect(result.stable).toBe(true);
    expect(result.displacements.B.x).toBeCloseTo(5e-7, 12);
    expect(result.displacements.B.y).toBeCloseTo(0, 12);
    expect(result.members[0].stress).toBeCloseTo(100000, 4);
    expect(result.members[0].axialForce).toBeCloseTo(1000, 6);
    expect(result.members[0].mode).toBe("tension");
    expect(result.reactions.A.x).toBeCloseTo(-1000, 6);
  });

  it("marks a member failed when stress exceeds its yield strength", () => {
    const result = simulateTruss(axialBar(2_000_000, 100e6));
    expect(result.stable).toBe(true);
    expect(result.members[0].utilization).toBeCloseTo(2, 6);
    expect(result.members[0].failed).toBe(true);
    expect(result.failedMemberIds).toEqual(["AB"]);
  });

  it("reports an unstable mechanism instead of returning misleading forces", () => {
    const model = axialBar(1000);
    model.nodes[1].fixedY = false;
    const result = simulateTruss(model);
    expect(result.stable).toBe(false);
    expect(result.errors).toContain("unstable_or_singular_structure");
  });

  it("rejects members that reference missing nodes", () => {
    const model = axialBar(1000);
    model.members[0].nodeB = "missing";
    const result = simulateTruss(model);
    expect(result.stable).toBe(false);
    expect(result.errors).toContain("invalid_member_nodes:AB");
  });
});
