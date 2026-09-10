import { randomInt } from "node:crypto";
import { ARCADE_PHYSICS_VERSION, simulateForceMotionExperiment } from "./arcade-physics";

export type ForceMotionArcadeQuestion = {
  id: string;
  kind: "simulation";
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
  scene: {
    cue: string;
    meterLabels: string[];
  };
};

function shuffle<T>(values: readonly T[]) {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
}

function clean(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function numericOptions(answer: number, unit: string, spread: number) {
  const values = [answer, answer + spread, Math.max(0, answer - spread), answer + spread * 2]
    .map((value) => clean(value));
  const unique = Array.from(new Set(values));
  let extra = 1;
  while (unique.length < 4) {
    const candidate = clean(answer + spread * (2 + extra));
    if (!unique.includes(candidate)) unique.push(candidate);
    extra += 1;
  }
  return shuffle(unique.slice(0, 4).map((value) => `${value} ${unit}`));
}

function accelerationQuestion(index: number, difficulty: number): ForceMotionArcadeQuestion {
  const massKg = randomInt(1, Math.min(8, 3 + difficulty) + 1);
  const acceleration = randomInt(1, Math.min(7, 2 + difficulty) + 1);
  const forceN = massKg * acceleration;
  const experiment = simulateForceMotionExperiment({
    massKg,
    horizontalForceNewtons: forceN,
    forceDurationSeconds: 1,
    totalDurationSeconds: 1,
  });
  const answer = `${clean(experiment.accelerationWhileForcedMps2)} m/s²`;
  return {
    id: String(index),
    kind: "simulation",
    prompt: `A ${massKg} kg cart is pushed horizontally with ${forceN} N of force. What acceleration should the cart have while the force is applied?`,
    answer,
    options: numericOptions(experiment.accelerationWhileForcedMps2, "m/s²", Math.max(1, Math.round(acceleration / 2))),
    explanation: `NovaCore simulates the cart using F = ma. ${forceN} N ÷ ${massKg} kg = ${clean(experiment.accelerationWhileForcedMps2)} m/s².`,
    scene: {
      cue: `Physics run ${ARCADE_PHYSICS_VERSION}: force is applied for 1.00 s from rest.`,
      meterLabels: [`Force ${forceN} N`, `Mass ${massKg} kg`, `a ${clean(experiment.accelerationWhileForcedMps2)} m/s²`],
    },
  };
}

function speedQuestion(index: number, difficulty: number): ForceMotionArcadeQuestion {
  const massKg = randomInt(1, Math.min(7, 2 + difficulty) + 1);
  const acceleration = randomInt(1, Math.min(6, 2 + difficulty) + 1);
  const durationSeconds = difficulty >= 4 ? 2 : 1;
  const forceN = massKg * acceleration;
  const experiment = simulateForceMotionExperiment({
    massKg,
    horizontalForceNewtons: forceN,
    forceDurationSeconds: durationSeconds,
    totalDurationSeconds: durationSeconds,
  });
  const speed = clean(experiment.finalSpeedMps);
  const answer = `${speed} m/s`;
  return {
    id: String(index),
    kind: "simulation",
    prompt: `A ${massKg} kg cart starts from rest. A constant ${forceN} N horizontal force acts for ${durationSeconds} s. About how fast is it moving at the end?`,
    answer,
    options: numericOptions(speed, "m/s", Math.max(1, acceleration)),
    explanation: `NovaCore used a fixed 1/120 s simulation step. The computed final speed is ${speed} m/s after ${durationSeconds} s.`,
    scene: {
      cue: `Run the push for ${durationSeconds}.00 s and observe the cart's final speed.`,
      meterLabels: [`Force ${forceN} N`, `Time ${durationSeconds} s`, `Speed ${speed} m/s`],
    },
  };
}

function displacementQuestion(index: number, difficulty: number): ForceMotionArcadeQuestion {
  const massKg = randomInt(1, Math.min(6, 2 + difficulty) + 1);
  const acceleration = randomInt(1, Math.min(5, 2 + difficulty) + 1);
  const durationSeconds = difficulty >= 3 ? 2 : 1;
  const forceN = massKg * acceleration;
  const experiment = simulateForceMotionExperiment({
    massKg,
    horizontalForceNewtons: forceN,
    forceDurationSeconds: durationSeconds,
    totalDurationSeconds: durationSeconds,
  });
  const displacement = clean(experiment.displacementMeters, 1);
  const answer = `${displacement} m`;
  const spread = Math.max(0.5, clean(displacement / 3, 1));
  return {
    id: String(index),
    kind: "simulation",
    prompt: `A ${massKg} kg cart starts from rest and receives ${forceN} N for ${durationSeconds} s on a frictionless track. Approximately how far does the NovaCore experiment move it?`,
    answer,
    options: numericOptions(displacement, "m", spread),
    explanation: `The fixed-step experiment measured about ${displacement} m of displacement. Small integration differences are controlled by the same 1/120 s step on every device.`,
    scene: {
      cue: `Measured experiment: start at x = 0, push continuously, then read displacement.`,
      meterLabels: [`Mass ${massKg} kg`, `Force ${forceN} N`, `Δx ${displacement} m`],
    },
  };
}

export function createForceMotionQuestions(difficulty: number, length: number): ForceMotionArcadeQuestion[] {
  const safeDifficulty = Math.max(1, Math.min(5, Math.floor(difficulty)));
  const safeLength = Math.max(1, Math.min(20, Math.floor(length)));
  return Array.from({ length: safeLength }, (_, index) => {
    const pattern = index % 3;
    if (pattern === 0) return accelerationQuestion(index, safeDifficulty);
    if (pattern === 1) return speedQuestion(index, safeDifficulty);
    return displacementQuestion(index, safeDifficulty);
  });
}
