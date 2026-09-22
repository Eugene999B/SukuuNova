import { MOVEMENT_PROFILES } from "./movement-profiles";
import type { MovementProfile } from "./types";

export type Vec2 = { x: number; z: number };

export type OpenWorldInput = {
  moveX: number;
  moveY: number;
  cameraYawRadians: number;
  sprint: boolean;
};

export type OpenWorldState = {
  position: Vec2;
  velocity: Vec2;
  facingRadians: number;
  sprinting: boolean;
  elapsedMs: number;
};

export type InteractionTarget = {
  id: string;
  position: Vec2;
  interactionRadius?: number;
  priority?: number;
  enabled?: boolean;
};

export type InteractionSelection = {
  target: InteractionTarget;
  distance: number;
  angleRadians: number;
  score: number;
};

export type OrbitCameraState = {
  yawRadians: number;
  pitchRadians: number;
  distance: number;
};

export type OrbitCameraInput = {
  lookX: number;
  lookY: number;
  zoomDelta?: number;
};

const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function length(vector: Vec2) {
  return Math.hypot(vector.x, vector.z);
}

function normalize(vector: Vec2): Vec2 {
  const magnitude = length(vector);
  if (magnitude <= 1e-8) return { x: 0, z: 0 };
  return { x: vector.x / magnitude, z: vector.z / magnitude };
}

function moveVectorToward(current: Vec2, target: Vec2, maxDelta: number): Vec2 {
  const delta = { x: target.x - current.x, z: target.z - current.z };
  const distance = length(delta);
  if (distance <= maxDelta || distance <= 1e-8) return target;
  const direction = normalize(delta);
  return { x: current.x + direction.x * maxDelta, z: current.z + direction.z * maxDelta };
}

function wrapAngle(angle: number) {
  let value = angle % TAU;
  if (value > Math.PI) value -= TAU;
  if (value < -Math.PI) value += TAU;
  return value;
}

function rotateToward(current: number, target: number, maxDelta: number) {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxDelta) return wrapAngle(target);
  return wrapAngle(current + Math.sign(delta) * maxDelta);
}

export function createOpenWorldState(input: Partial<OpenWorldState> = {}): OpenWorldState {
  return {
    position: input.position ?? { x: 0, z: 0 },
    velocity: input.velocity ?? { x: 0, z: 0 },
    facingRadians: input.facingRadians ?? 0,
    sprinting: input.sprinting ?? false,
    elapsedMs: input.elapsedMs ?? 0,
  };
}

/**
 * Camera-relative third-person movement for non-violent exploration worlds.
 * Camera rotation changes movement direction, but the acceleration/deceleration
 * profile stays stable so traversal remains predictable.
 */
export function stepOpenWorldMovement(
  previous: OpenWorldState,
  input: OpenWorldInput,
  dtSeconds: number,
  profile: MovementProfile = MOVEMENT_PROFILES.openWorldExploration,
): OpenWorldState {
  const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
  const rawInput = { x: clamp(input.moveX, -1, 1), z: clamp(input.moveY, -1, 1) };
  const local = length(rawInput) > 1 ? normalize(rawInput) : rawInput;

  const sin = Math.sin(input.cameraYawRadians);
  const cos = Math.cos(input.cameraYawRadians);
  const forward = { x: sin, z: cos };
  const right = { x: cos, z: -sin };
  const worldDirection = normalize({
    x: right.x * local.x + forward.x * local.z,
    z: right.z * local.x + forward.z * local.z,
  });

  const hasInput = length(worldDirection) > 0;
  const speed = input.sprint && profile.sprintSpeed ? profile.sprintSpeed : profile.maxSpeed;
  const targetVelocity = hasInput
    ? { x: worldDirection.x * speed, z: worldDirection.z * speed }
    : { x: 0, z: 0 };
  const rate = hasInput ? profile.acceleration : profile.deceleration;
  const velocity = moveVectorToward(previous.velocity, targetVelocity, Math.max(0, rate) * dt);

  let facingRadians = previous.facingRadians;
  if (hasInput) {
    const targetFacing = Math.atan2(worldDirection.x, worldDirection.z);
    const turnRate = 10 * clamp(profile.turnResponsiveness, 0.05, 1.5);
    facingRadians = rotateToward(previous.facingRadians, targetFacing, turnRate * dt);
  }

  return {
    position: {
      x: previous.position.x + velocity.x * dt,
      z: previous.position.z + velocity.z * dt,
    },
    velocity,
    facingRadians,
    sprinting: Boolean(input.sprint && hasInput),
    elapsedMs: previous.elapsedMs + dt * 1000,
  };
}

/**
 * Chooses a forgiving contextual interaction target. The player does not need
 * pixel-perfect positioning: distance, facing and explicit priority all
 * contribute to target selection.
 */
export function selectInteractionTarget(
  playerPosition: Vec2,
  playerFacingRadians: number,
  targets: InteractionTarget[],
  options: { maxDistance?: number; coneDegrees?: number } = {},
): InteractionSelection | null {
  const maxDistance = Math.max(0.1, options.maxDistance ?? 3.2);
  const halfCone = clamp((options.coneDegrees ?? 110) * Math.PI / 360, 0.1, Math.PI);
  let best: InteractionSelection | null = null;

  for (const target of targets) {
    if (target.enabled === false) continue;
    const delta = { x: target.position.x - playerPosition.x, z: target.position.z - playerPosition.z };
    const distance = length(delta);
    const allowedDistance = maxDistance + Math.max(0, target.interactionRadius ?? 0);
    if (distance > allowedDistance) continue;

    const targetAngle = distance <= 1e-8 ? playerFacingRadians : Math.atan2(delta.x, delta.z);
    const angle = Math.abs(wrapAngle(targetAngle - playerFacingRadians));
    if (angle > halfCone && distance > Math.min(1.1, allowedDistance)) continue;

    const distanceScore = 1 - clamp(distance / allowedDistance, 0, 1);
    const angleScore = 1 - clamp(angle / halfCone, 0, 1);
    const priorityScore = clamp(target.priority ?? 0, -1, 2) * 0.15;
    const score = distanceScore * 0.58 + angleScore * 0.32 + priorityScore;
    const selection = { target, distance, angleRadians: angle, score };
    if (!best || selection.score > best.score) best = selection;
  }

  return best;
}

export function stepOrbitCamera(
  previous: OrbitCameraState,
  input: OrbitCameraInput,
  dtSeconds: number,
  options: { sensitivity?: number; minDistance?: number; maxDistance?: number } = {},
): OrbitCameraState {
  const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
  const sensitivity = clamp(options.sensitivity ?? 1, 0.1, 3);
  const minDistance = Math.max(1, options.minDistance ?? 2.2);
  const maxDistance = Math.max(minDistance, options.maxDistance ?? 10);
  const angularSpeed = 2.7 * sensitivity;
  return {
    yawRadians: wrapAngle(previous.yawRadians + clamp(input.lookX, -1, 1) * angularSpeed * dt),
    pitchRadians: clamp(previous.pitchRadians + clamp(input.lookY, -1, 1) * angularSpeed * dt, -1.15, 0.8),
    distance: clamp(previous.distance + (input.zoomDelta ?? 0), minDistance, maxDistance),
  };
}
