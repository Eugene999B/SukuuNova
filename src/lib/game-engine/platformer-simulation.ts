import { MOVEMENT_PROFILES } from "./movement-profiles";
import type { MovementProfile } from "./types";

export type PlatformerInput = {
  moveX: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  sprint?: boolean;
};

export type PlatformerEnvironment = {
  grounded: boolean;
  groundY?: number;
};

export type PlatformerState = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  grounded: boolean;
  coyoteRemainingMs: number;
  jumpBufferRemainingMs: number;
  elapsedMs: number;
};

export type PlatformerStepResult = {
  state: PlatformerState;
  jumped: boolean;
  landed: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function moveToward(current: number, target: number, amount: number) {
  if (current < target) return Math.min(current + amount, target);
  if (current > target) return Math.max(current - amount, target);
  return target;
}

function required(profile: MovementProfile, key: "gravity" | "jumpVelocity") {
  const value = profile[key];
  if (typeof value !== "number") throw new Error(`Movement profile ${profile.id} requires ${key}.`);
  return value;
}

export function createPlatformerState(input: Partial<PlatformerState> = {}): PlatformerState {
  return {
    x: input.x ?? 0,
    y: input.y ?? 0,
    velocityX: input.velocityX ?? 0,
    velocityY: input.velocityY ?? 0,
    grounded: input.grounded ?? true,
    coyoteRemainingMs: input.coyoteRemainingMs ?? 0,
    jumpBufferRemainingMs: input.jumpBufferRemainingMs ?? 0,
    elapsedMs: input.elapsedMs ?? 0,
  };
}

/**
 * Pure movement simulation. The level/renderer owns collision resolution and
 * reports whether the player is grounded; this module owns control feel.
 */
export function stepPlatformer(
  previous: PlatformerState,
  input: PlatformerInput,
  environment: PlatformerEnvironment,
  dtSeconds: number,
  profile: MovementProfile = MOVEMENT_PROFILES.responsivePlatformer,
): PlatformerStepResult {
  const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
  const dtMs = dt * 1000;
  const gravity = required(profile, "gravity");
  const jumpVelocity = required(profile, "jumpVelocity");
  const coyoteTimeMs = Math.max(0, profile.coyoteTimeMs ?? 0);
  const jumpBufferMs = Math.max(0, profile.jumpBufferMs ?? 0);
  const airControl = clamp(profile.airControl ?? 1, 0, 1);
  const wasGrounded = previous.grounded;
  const groundedAtStart = environment.grounded;

  let coyoteRemainingMs = groundedAtStart
    ? coyoteTimeMs
    : Math.max(0, previous.coyoteRemainingMs - dtMs);
  let jumpBufferRemainingMs = input.jumpPressed
    ? jumpBufferMs
    : Math.max(0, previous.jumpBufferRemainingMs - dtMs);

  const requestedMove = clamp(input.moveX, -1, 1);
  const speed = input.sprint && profile.sprintSpeed ? profile.sprintSpeed : profile.maxSpeed;
  const targetVelocityX = requestedMove * speed;
  const reversing = previous.velocityX !== 0 && Math.sign(previous.velocityX) !== Math.sign(targetVelocityX);
  const slowing = requestedMove === 0 || reversing;
  const baseRate = slowing ? profile.deceleration : profile.acceleration;
  const controlScale = groundedAtStart ? 1 : airControl;
  const velocityX = moveToward(previous.velocityX, targetVelocityX, baseRate * controlScale * dt);

  let velocityY = previous.velocityY;
  let grounded = groundedAtStart;
  let jumped = false;

  if (jumpBufferRemainingMs > 0 && (groundedAtStart || coyoteRemainingMs > 0)) {
    velocityY = jumpVelocity;
    grounded = false;
    jumped = true;
    jumpBufferRemainingMs = 0;
    coyoteRemainingMs = 0;
  }

  if (!grounded) {
    let gravityScale = 1;
    if (velocityY < 0) gravityScale = Math.max(1, profile.fallGravityMultiplier ?? 1);
    else if (velocityY > 0 && input.jumpHeld) gravityScale = 0.62;
    else if (velocityY > 0 && !input.jumpHeld) gravityScale = 1.28;
    velocityY -= gravity * gravityScale * dt;
  } else if (!jumped) {
    velocityY = 0;
  }

  let x = previous.x + velocityX * dt;
  let y = previous.y + velocityY * dt;
  const landed = !jumped && !wasGrounded && groundedAtStart;

  if (groundedAtStart && !jumped && typeof environment.groundY === "number") {
    y = environment.groundY;
  }

  if (!Number.isFinite(x)) x = previous.x;
  if (!Number.isFinite(y)) y = previous.y;

  return {
    state: {
      x,
      y,
      velocityX,
      velocityY,
      grounded,
      coyoteRemainingMs,
      jumpBufferRemainingMs,
      elapsedMs: previous.elapsedMs + dtMs,
    },
    jumped,
    landed,
  };
}
