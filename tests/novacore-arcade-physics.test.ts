import { describe, expect, it } from "vitest";
import {
  addPhysicsBody,
  applyPhysicsForce,
  applyPhysicsImpulse,
  createPhysicsWorld,
  getPhysicsBody,
  physicsSnapshot,
  simulateForceMotionExperiment,
  stepPhysicsWorld,
} from "../src/lib/novacore/arcade-physics";

function makeForceWorld() {
  const world = createPhysicsWorld({ gravity: { x: 0, y: 0 }, fixedDeltaSeconds: 1 / 120, maxSubSteps: 16 });
  addPhysicsBody(world, {
    id: "cart",
    shape: { kind: "box", halfWidth: 0.5, halfHeight: 0.25 },
    mass: 2,
    restitution: 0,
    friction: 0,
  });
  return world;
}

describe("NovaCore Arcade physics", () => {
  it("follows Newton's second law under a constant force", () => {
    const result = simulateForceMotionExperiment({
      massKg: 2,
      horizontalForceNewtons: 4,
      forceDurationSeconds: 1,
      totalDurationSeconds: 1,
      rollingDamping: 0,
    });
    expect(result.accelerationWhileForcedMps2).toBe(2);
    expect(result.finalSpeedMps).toBeCloseTo(2, 5);
    expect(result.displacementMeters).toBeCloseTo(1, 1);
    expect(result.kineticEnergyJoules).toBeCloseTo(4, 4);
  });

  it("applies impulse according to inverse mass", () => {
    const world = makeForceWorld();
    applyPhysicsImpulse(world, "cart", { x: 4, y: 0 });
    expect(getPhysicsBody(world, "cart")?.velocity.x).toBeCloseTo(2, 8);
  });

  it("produces the same fixed-step result at 30 FPS and 60 FPS", () => {
    const sixty = makeForceWorld();
    const thirty = makeForceWorld();

    for (let frame = 0; frame < 60; frame += 1) {
      applyPhysicsForce(sixty, "cart", { x: 4, y: 0 });
      stepPhysicsWorld(sixty, 1 / 60);
    }
    for (let frame = 0; frame < 30; frame += 1) {
      applyPhysicsForce(thirty, "cart", { x: 4, y: 0 });
      stepPhysicsWorld(thirty, 1 / 30);
    }

    expect(physicsSnapshot(thirty)).toEqual(physicsSnapshot(sixty));
    expect(thirty.simulationSeconds).toBeCloseTo(sixty.simulationSeconds, 10);
  });

  it("resolves an equal-mass elastic circle collision", () => {
    const world = createPhysicsWorld({ gravity: { x: 0, y: 0 }, fixedDeltaSeconds: 1 / 120, solverIterations: 8 });
    addPhysicsBody(world, {
      id: "a",
      shape: { kind: "circle", radius: 0.5 },
      position: { x: -0.5, y: 0 },
      velocity: { x: 1, y: 0 },
      mass: 1,
      restitution: 1,
      friction: 0,
    });
    addPhysicsBody(world, {
      id: "b",
      shape: { kind: "circle", radius: 0.5 },
      position: { x: 0.5, y: 0 },
      velocity: { x: -1, y: 0 },
      mass: 1,
      restitution: 1,
      friction: 0,
    });

    stepPhysicsWorld(world, 1 / 120);
    expect(getPhysicsBody(world, "a")?.velocity.x).toBeCloseTo(-1, 6);
    expect(getPhysicsBody(world, "b")?.velocity.x).toBeCloseTo(1, 6);
  });

  it("prevents a dynamic body from crossing a static wall", () => {
    const world = createPhysicsWorld({ gravity: { x: 0, y: 0 }, fixedDeltaSeconds: 1 / 120, solverIterations: 10 });
    addPhysicsBody(world, {
      id: "ball",
      shape: { kind: "circle", radius: 0.2 },
      position: { x: 0, y: 0 },
      velocity: { x: 2, y: 0 },
      mass: 1,
      restitution: 0,
      friction: 0,
    });
    addPhysicsBody(world, {
      id: "wall",
      kind: "static",
      shape: { kind: "box", halfWidth: 0.1, halfHeight: 2 },
      position: { x: 1, y: 0 },
      restitution: 0,
      friction: 0,
    });

    for (let step = 0; step < 100; step += 1) stepPhysicsWorld(world, 1 / 120);
    const ball = getPhysicsBody(world, "ball");
    expect(ball).not.toBeNull();
    expect(ball!.position.x).toBeLessThanOrEqual(0.701);
    expect(Math.abs(ball!.velocity.x)).toBeLessThan(0.01);
  });

  it("caps catch-up work and records dropped simulation time on a stalled frame", () => {
    const world = createPhysicsWorld({ gravity: { x: 0, y: 0 }, fixedDeltaSeconds: 1 / 120, maxSubSteps: 2 });
    addPhysicsBody(world, { id: "body", shape: { kind: "circle", radius: 0.5 }, velocity: { x: 1, y: 0 } });
    const result = stepPhysicsWorld(world, 0.25);
    expect(result.subSteps).toBe(2);
    expect(result.droppedSeconds).toBeGreaterThan(0.2);
    expect(result.alpha).toBeGreaterThanOrEqual(0);
    expect(result.alpha).toBeLessThan(1);
  });
});
