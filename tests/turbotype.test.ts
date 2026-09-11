import { describe, expect, it } from "vitest";
import { createTurboTypeQuestions, turboTypeTargetFromPrompt, turboTypeWeakKeysFromSnapshots } from "../src/lib/turbo-type-content";
import { mergeTypingTelemetry, normalizeTypingTelemetry, type TypingTelemetry } from "../src/lib/arcade-telemetry-service";

function telemetry(overrides: Partial<TypingTelemetry> = {}): TypingTelemetry {
  return {
    version: 1,
    final: false,
    elapsedMs: 60000,
    totalKeystrokes: 50,
    correctKeystrokes: 45,
    accuracy: 999,
    wpm: 999,
    troublesomeKeys: [],
    ...overrides,
  };
}

describe("TurboType learning content", () => {
  it("extracts the exact typing target after age-aware presentation framing", () => {
    expect(turboTypeTargetFromPrompt("Skill sprint · Type this exactly: Ready, set, learn!")).toBe("Ready, set, learn!");
  });

  it("prioritises historical weak keys while keeping deterministic curriculum-controlled phrases", () => {
    const questions = createTurboTypeQuestions(3, 5, ["%"]);
    expect(questions).toHaveLength(5);
    expect(questions.filter((question) => question.answer.includes("%")).length).toBeGreaterThanOrEqual(2);
    expect(questions.every((question) => question.kind === "typed" && question.caseSensitive === true)).toBe(true);
  });

  it("aggregates weak keys from bounded completed-round snapshots", () => {
    const weak = turboTypeWeakKeysFromSnapshots([
      { typingTelemetry: { troublesomeKeys: [{ key: "r", count: 2 }, { key: "t", count: 1 }] } },
      { typingTelemetry: { troublesomeKeys: [{ key: "r", count: 3 }, { key: "!", count: 4 }] } },
    ]);
    expect(weak.slice(0, 3)).toEqual(["r", "!", "t"]);
  });
});

describe("TurboType telemetry", () => {
  it("recomputes accuracy and WPM instead of trusting client-supplied scores", () => {
    const normalized = normalizeTypingTelemetry(telemetry(), true);
    expect(normalized).toMatchObject({ final: true, totalKeystrokes: 50, correctKeystrokes: 45, accuracy: 90, wpm: 9 });
  });

  it("merges save-and-resume sessions into one bounded learner summary", () => {
    const snapshot = {
      typingTelemetry: telemetry({
        elapsedMs: 30000,
        totalKeystrokes: 20,
        correctKeystrokes: 18,
        troublesomeKeys: [{ key: "r", count: 2 }],
      }),
    };
    const merged = mergeTypingTelemetry(snapshot, telemetry({
      elapsedMs: 30000,
      totalKeystrokes: 30,
      correctKeystrokes: 27,
      troublesomeKeys: [{ key: "r", count: 1 }, { key: "t", count: 2 }],
    }), true);
    expect(merged).toMatchObject({ final: true, elapsedMs: 60000, totalKeystrokes: 50, correctKeystrokes: 45, accuracy: 90, wpm: 9 });
    expect(merged?.troublesomeKeys).toEqual([{ key: "r", count: 3 }, { key: "t", count: 2 }]);
  });

  it("does not double-count telemetry after a round has already been finalized", () => {
    const final = telemetry({ final: true, elapsedMs: 60000, totalKeystrokes: 50, correctKeystrokes: 45, troublesomeKeys: [{ key: "x", count: 2 }] });
    const merged = mergeTypingTelemetry({ typingTelemetry: final }, telemetry({ totalKeystrokes: 10, correctKeystrokes: 10 }), true);
    expect(merged).toMatchObject({ final: true, totalKeystrokes: 50, correctKeystrokes: 45 });
    expect(merged?.troublesomeKeys).toEqual([{ key: "x", count: 2 }]);
  });
});
