import type { CameraProfile, MovementProfile } from "./types";

/**
 * Starting tuning values, not promises of physical realism. The adapter for a
 * concrete renderer/physics engine may scale units, but should preserve the
 * relationships and feel described here.
 *
 * Core rule: responsiveness and readability beat realism that fights the user.
 */
export const MOVEMENT_PROFILES = {
  responsivePlatformer: {
    id: "responsive-platformer",
    category: "platformer",
    acceleration: 36,
    deceleration: 44,
    maxSpeed: 8.5,
    turnResponsiveness: 0.95,
    gravity: 26,
    fallGravityMultiplier: 1.65,
    jumpVelocity: 11,
    coyoteTimeMs: 110,
    jumpBufferMs: 120,
    airControl: 0.72,
    collisionForgiveness: 0.08,
    notes: [
      "Keep takeoff and landing predictable.",
      "Use coyote time and jump buffering to forgive near-miss input.",
      "Increase gravity after the jump apex for a crisp landing without a floaty rise.",
    ],
  },
  arcadeRunner: {
    id: "arcade-runner",
    category: "runner",
    acceleration: 18,
    deceleration: 18,
    maxSpeed: 17,
    turnResponsiveness: 1,
    laneCount: 3,
    laneChangeDurationMs: 145,
    autoForwardSpeed: 10,
    jumpVelocity: 9.5,
    gravity: 24,
    fallGravityMultiplier: 1.55,
    jumpBufferMs: 90,
    collisionForgiveness: 0.12,
    notes: [
      "Movement state changes immediately; animation follows game logic rather than blocking it.",
      "Obstacle colliders may be slightly more forgiving than their visual silhouette.",
      "Ramp speed and obstacle density independently so challenge can rise without destroying control feel.",
    ],
  },
  openWorldExploration: {
    id: "open-world-exploration",
    category: "open-world",
    acceleration: 15,
    deceleration: 20,
    maxSpeed: 5.8,
    sprintSpeed: 9.2,
    turnResponsiveness: 0.78,
    gravity: 24,
    fallGravityMultiplier: 1.35,
    jumpVelocity: 8,
    coyoteTimeMs: 80,
    jumpBufferMs: 90,
    airControl: 0.45,
    collisionForgiveness: 0.06,
    notes: [
      "Movement should be camera-relative and transition cleanly between walk, jog and sprint.",
      "Contextual interactions should not require pixel-perfect positioning.",
      "World traversal should remain enjoyable between educational objectives, not become dead travel time.",
    ],
  },
  investigationWalk: {
    id: "investigation-walk",
    category: "investigation",
    acceleration: 12,
    deceleration: 18,
    maxSpeed: 4.6,
    sprintSpeed: 6.5,
    turnResponsiveness: 0.72,
    gravity: 24,
    fallGravityMultiplier: 1.3,
    collisionForgiveness: 0.08,
    notes: [
      "Prioritize precise stopping near evidence and interaction targets.",
      "Interaction cones and soft target snapping prevent fiddly object selection.",
    ],
  },
  strategyCursor: {
    id: "strategy-cursor",
    category: "strategy",
    acceleration: 0,
    deceleration: 0,
    maxSpeed: 0,
    turnResponsiveness: 1,
    collisionForgiveness: 0,
    notes: [
      "No avatar locomotion required.",
      "Use pan, zoom, selection, placement and path previews as the movement language.",
    ],
  },
  physicsBuilder: {
    id: "physics-builder",
    category: "construction",
    acceleration: 0,
    deceleration: 0,
    maxSpeed: 0,
    turnResponsiveness: 1,
    collisionForgiveness: 0,
    notes: [
      "Separate edit mode from deterministic-enough simulation mode.",
      "Expose forces and failure points visually instead of only reporting a wrong answer.",
    ],
  },
} satisfies Record<string, MovementProfile>;

export const CAMERA_PROFILES = {
  platformerFollow: {
    id: "platformer-follow",
    mode: "follow",
    followLag: 0.08,
    lookAhead: 0.2,
    fieldOfView: 55,
    collisionAvoidance: false,
    notes: ["Avoid camera lag that makes precision jumps feel disconnected."],
  },
  runnerForward: {
    id: "runner-forward",
    mode: "runner",
    followLag: 0.06,
    lookAhead: 0.65,
    fieldOfView: 62,
    speedFovBoost: 7,
    collisionAvoidance: false,
    notes: ["Show enough road ahead to let players anticipate, not merely react."],
  },
  openWorldOrbit: {
    id: "open-world-orbit",
    mode: "orbit",
    followLag: 0.12,
    lookAhead: 0.22,
    fieldOfView: 67,
    speedFovBoost: 5,
    collisionAvoidance: true,
    notes: [
      "Camera must participate in the sense of speed.",
      "Offer sensitivity, inversion, shake and auto-follow accessibility controls.",
    ],
  },
  investigationOrbit: {
    id: "investigation-orbit",
    mode: "orbit",
    followLag: 0.1,
    lookAhead: 0.08,
    fieldOfView: 60,
    collisionAvoidance: true,
    notes: ["Favor close inspection and stable framing over dramatic speed effects."],
  },
  strategyTopDown: {
    id: "strategy-top-down",
    mode: "top-down",
    followLag: 0.1,
    lookAhead: 0,
    notes: ["Smooth pan/zoom and clear bounds are more important than character follow."],
  },
  builderStatic: {
    id: "builder-static",
    mode: "static",
    followLag: 0,
    lookAhead: 0,
    notes: ["Use orbit/pan tools around the build rather than an avatar camera."],
  },
} satisfies Record<string, CameraProfile>;

export const FIXED_SIMULATION_HZ = 60;
export const FIXED_SIMULATION_DT_SECONDS = 1 / FIXED_SIMULATION_HZ;

/**
 * Adaptive difficulty may change challenges around the player, but should not
 * secretly alter these fundamentals mid-run. Stable controls build muscle memory.
 */
export const LOCKED_DURING_ACTIVE_RUN: ReadonlyArray<keyof MovementProfile> = [
  "acceleration",
  "deceleration",
  "maxSpeed",
  "turnResponsiveness",
  "gravity",
  "fallGravityMultiplier",
  "jumpVelocity",
  "coyoteTimeMs",
  "jumpBufferMs",
  "airControl",
  "laneChangeDurationMs",
  "collisionForgiveness",
];
