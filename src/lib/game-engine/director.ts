import type { DirectorAction, DirectorInput, GameplayTelemetry } from "./types";

function safeRatio(numerator: number, denominator: number) {
  return numerator / Math.max(1, denominator);
}

function frustrationScore(telemetry: GameplayTelemetry) {
  const attempts = telemetry.successes + telemetry.failures;
  const failureRate = safeRatio(telemetry.failures, attempts);
  const retryPressure = Math.min(1, telemetry.retries / 4);
  const hintPressure = Math.min(1, telemetry.hintsUsed / 4);
  return failureRate * 0.55 + retryPressure * 0.25 + hintPressure * 0.2;
}

function boredomScore(telemetry: GameplayTelemetry) {
  const attempts = telemetry.successes + telemetry.failures;
  const successRate = safeRatio(telemetry.successes, attempts);
  const skipPressure = Math.min(1, telemetry.skippedNarrative / 5);
  const repetitionPressure = Math.min(1, telemetry.repeatedActionCount / 8);
  return successRate * 0.35 + skipPressure * 0.25 + repetitionPressure * 0.4;
}

function mechanicRepetition(telemetry: GameplayTelemetry) {
  const recent = telemetry.recentMechanics.slice(-5);
  if (recent.length < 3) return 0;
  const counts = new Map<string, number>();
  for (const mechanic of recent) counts.set(mechanic, (counts.get(mechanic) ?? 0) + 1);
  return Math.max(...counts.values()) / recent.length;
}

function weakestConcept(input: DirectorInput) {
  return input.mastery
    .filter((signal) => Number.isFinite(signal.mastery))
    .sort((a, b) => a.mastery - b.mastery)[0];
}

function pickDifferentMechanic(input: DirectorInput) {
  const recent = new Set(input.telemetry.recentMechanics.slice(-4));
  return input.availableMechanics.find((mechanic) => mechanic !== input.currentMechanic && !recent.has(mechanic))
    ?? input.availableMechanics.find((mechanic) => mechanic !== input.currentMechanic);
}

/**
 * Runtime pacing director.
 *
 * It adapts the challenge AROUND the player. It deliberately does not return
 * movement tuning changes. Secretly changing jump arcs, steering or lane timing
 * during a run destroys predictability and player muscle memory.
 */
export function directNextBeat(input: DirectorInput): DirectorAction {
  const frustration = frustrationScore(input.telemetry);
  const boredom = boredomScore(input.telemetry);
  const repetition = mechanicRepetition(input.telemetry);
  const weak = weakestConcept(input);

  if (frustration >= 0.64) {
    if (weak && weak.mastery < 0.55) {
      return {
        type: "contextual-remediation",
        conceptKey: weak.conceptKey,
        reason: "Repeated failure suggests the next beat should teach through a simpler in-world action.",
      };
    }
    return {
      type: "add-support",
      strength: frustration >= 0.8 ? 2 : 1,
      reason: "Failure, retries or hint use indicate rising frustration; add environmental support without changing controls.",
    };
  }

  if (repetition >= 0.6) {
    const nextMechanic = pickDifferentMechanic(input);
    if (nextMechanic) {
      return {
        type: "rotate-mechanic",
        mechanic: nextMechanic,
        reason: "The recent interaction loop is repeating too heavily.",
      };
    }
  }

  if (boredom >= 0.7) {
    return {
      type: "raise-challenge",
      amount: boredom >= 0.86 ? "medium" : "small",
      reason: "High success plus skipping/repetition suggests the current beat is no longer demanding enough.",
    };
  }

  if (weak && weak.mastery < 0.45) {
    return {
      type: "contextual-remediation",
      conceptKey: weak.conceptKey,
      reason: "A weak academic concept should reappear as gameplay rather than as a detached quiz interruption.",
    };
  }

  return {
    type: "keep-course",
    reason: "Engagement, challenge and mechanic variety are currently within target range.",
  };
}
