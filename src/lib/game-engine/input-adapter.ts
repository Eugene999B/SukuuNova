import type { InputIntent } from "./types";

export type InputButtons = {
  jumpPressed?: boolean;
  jumpHeld?: boolean;
  sprint?: boolean;
  crouch?: boolean;
  interact?: boolean;
  primaryAction?: boolean;
  secondaryAction?: boolean;
};

export type AnalogInput = InputButtons & {
  moveX?: number;
  moveY?: number;
  lookX?: number;
  lookY?: number;
};

const clampAxis = (value: number | undefined) => Math.max(-1, Math.min(1, Number.isFinite(value) ? value ?? 0 : 0));

export function applyRadialDeadzone(x: number, y: number, deadzone = 0.16) {
  const safeDeadzone = Math.max(0, Math.min(0.8, deadzone));
  const rawX = clampAxis(x);
  const rawY = clampAxis(y);
  const rawMagnitude = Math.hypot(rawX, rawY);
  if (rawMagnitude <= safeDeadzone || rawMagnitude <= 1e-8) return { x: 0, y: 0 };

  // Keep the direction from the unclamped vector, then cap only its length.
  // Using the capped magnitude as the divisor would turn (1, 1) into a vector
  // with length sqrt(2), making diagonal movement faster than cardinal movement.
  const magnitude = Math.min(1, rawMagnitude);
  const scaledMagnitude = (magnitude - safeDeadzone) / (1 - safeDeadzone);
  return {
    x: (rawX / rawMagnitude) * scaledMagnitude,
    y: (rawY / rawMagnitude) * scaledMagnitude,
  };
}

export function analogInputIntent(input: AnalogInput, deadzone = 0.16): InputIntent {
  const move = applyRadialDeadzone(input.moveX ?? 0, input.moveY ?? 0, deadzone);
  const look = applyRadialDeadzone(input.lookX ?? 0, input.lookY ?? 0, deadzone);
  return {
    moveX: move.x,
    moveY: move.y,
    lookX: look.x,
    lookY: look.y,
    jumpPressed: Boolean(input.jumpPressed),
    jumpHeld: Boolean(input.jumpHeld),
    sprint: Boolean(input.sprint),
    crouch: Boolean(input.crouch),
    interact: Boolean(input.interact),
    primaryAction: Boolean(input.primaryAction),
    secondaryAction: Boolean(input.secondaryAction),
  };
}

export function keyboardInputIntent(
  pressedCodes: ReadonlySet<string>,
  edge: InputButtons = {},
): InputIntent {
  const right = pressedCodes.has("ArrowRight") || pressedCodes.has("KeyD") ? 1 : 0;
  const left = pressedCodes.has("ArrowLeft") || pressedCodes.has("KeyA") ? 1 : 0;
  const up = pressedCodes.has("ArrowUp") || pressedCodes.has("KeyW") ? 1 : 0;
  const down = pressedCodes.has("ArrowDown") || pressedCodes.has("KeyS") ? 1 : 0;
  const jumpHeld = pressedCodes.has("Space") || up > 0;
  const keyboardSprint = pressedCodes.has("ShiftLeft") || pressedCodes.has("ShiftRight");
  const keyboardCrouch = pressedCodes.has("ControlLeft") || pressedCodes.has("ControlRight");
  return {
    moveX: right - left,
    moveY: up - down,
    lookX: 0,
    lookY: 0,
    jumpPressed: Boolean(edge.jumpPressed),
    jumpHeld: edge.jumpHeld ?? jumpHeld,
    sprint: edge.sprint ?? keyboardSprint,
    crouch: edge.crouch ?? keyboardCrouch,
    interact: Boolean(edge.interact),
    primaryAction: Boolean(edge.primaryAction),
    secondaryAction: Boolean(edge.secondaryAction),
  };
}

function strongestAxis(first: number, second: number) {
  return Math.abs(second) > Math.abs(first) ? second : first;
}

/** Merge keyboard/touch/gamepad sources without making one device mandatory. */
export function mergeInputIntents(...intents: InputIntent[]): InputIntent {
  return intents.reduce<InputIntent>((merged, intent) => ({
    moveX: strongestAxis(merged.moveX, intent.moveX),
    moveY: strongestAxis(merged.moveY, intent.moveY),
    lookX: strongestAxis(merged.lookX, intent.lookX),
    lookY: strongestAxis(merged.lookY, intent.lookY),
    jumpPressed: merged.jumpPressed || intent.jumpPressed,
    jumpHeld: merged.jumpHeld || intent.jumpHeld,
    sprint: merged.sprint || intent.sprint,
    crouch: merged.crouch || intent.crouch,
    interact: merged.interact || intent.interact,
    primaryAction: merged.primaryAction || intent.primaryAction,
    secondaryAction: merged.secondaryAction || intent.secondaryAction,
  }), analogInputIntent({}));
}
