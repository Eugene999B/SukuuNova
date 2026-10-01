import { describe, expect, it } from "vitest";
import {
  createOpenWorldState,
  selectInteractionTarget,
  stepOpenWorldMovement,
  stepOrbitCamera,
} from "../src/lib/game-engine/open-world-simulation";

describe("open world traversal", () => {
  it("moves forward relative to camera yaw", () => {
    let state = createOpenWorldState();
    for (let index = 0; index < 30; index += 1) {
      state = stepOpenWorldMovement(state, { moveX: 0, moveY: 1, cameraYawRadians: Math.PI / 2, sprint: false }, 1 / 60);
    }
    expect(state.position.x).toBeGreaterThan(0.5);
    expect(Math.abs(state.position.z)).toBeLessThan(0.05);
  });

  it("accelerates sprinting without changing the camera-relative direction", () => {
    let walk = createOpenWorldState();
    let sprint = createOpenWorldState();
    for (let index = 0; index < 60; index += 1) {
      walk = stepOpenWorldMovement(walk, { moveX: 0, moveY: 1, cameraYawRadians: 0, sprint: false }, 1 / 60);
      sprint = stepOpenWorldMovement(sprint, { moveX: 0, moveY: 1, cameraYawRadians: 0, sprint: true }, 1 / 60);
    }
    expect(sprint.position.z).toBeGreaterThan(walk.position.z);
    expect(Math.abs(sprint.position.x)).toBeLessThan(0.001);
  });

  it("decelerates smoothly instead of snapping velocity to zero", () => {
    const moving = createOpenWorldState({ velocity: { x: 0, z: 5 } });
    const stoppedInput = stepOpenWorldMovement(moving, { moveX: 0, moveY: 0, cameraYawRadians: 0, sprint: false }, 1 / 60);
    expect(stoppedInput.velocity.z).toBeGreaterThan(0);
    expect(stoppedInput.velocity.z).toBeLessThan(5);
  });
});

describe("contextual interaction targeting", () => {
  it("prefers a nearby target in front over a similarly close target behind", () => {
    const selection = selectInteractionTarget(
      { x: 0, z: 0 },
      0,
      [
        { id: "front", position: { x: 0.4, z: 2 } },
        { id: "behind", position: { x: 0, z: -1.8 } },
      ],
    );
    expect(selection?.target.id).toBe("front");
  });

  it("still allows a very close target slightly outside the normal facing cone", () => {
    const selection = selectInteractionTarget(
      { x: 0, z: 0 },
      0,
      [{ id: "beside", position: { x: 0.8, z: -0.1 } }],
      { coneDegrees: 70 },
    );
    expect(selection?.target.id).toBe("beside");
  });

  it("ignores disabled targets", () => {
    const selection = selectInteractionTarget(
      { x: 0, z: 0 },
      0,
      [
        { id: "disabled", position: { x: 0, z: 1 }, enabled: false, priority: 2 },
        { id: "enabled", position: { x: 0, z: 2 } },
      ],
    );
    expect(selection?.target.id).toBe("enabled");
  });
});

describe("orbit camera", () => {
  it("clamps pitch and zoom to playable bounds", () => {
    let camera = { yawRadians: 0, pitchRadians: 0, distance: 5 };
    camera = stepOrbitCamera(camera, { lookX: 0, lookY: 1, zoomDelta: -100 }, 1, { minDistance: 2, maxDistance: 8 });
    expect(camera.pitchRadians).toBeLessThanOrEqual(0.8);
    expect(camera.distance).toBe(2);
  });
});
