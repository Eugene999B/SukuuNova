import { describe, expect, it } from "vitest";
import { ARCADE_GAME_CATALOG } from "../src/lib/arcade-catalog";
import { canGenerateArcadeContent, createArcadeGameQuestions } from "../src/lib/arcade-content";
import { canGenerateArcadeInteractionContent } from "../src/lib/arcade-interaction-content";
import { canGenerateArcadeResponseContent } from "../src/lib/arcade-response-content";
import { canGenerateArcadeWorldContent } from "../src/lib/arcade-world-content";
import { arcadeDifficultyForAge, arcadeQuestionHistorySignatures, arcadeQuestionSignature, buildVariedArcadeQuestionSet, presentArcadeQuestionForAge } from "../src/lib/arcade-variation";

describe("Arcade launch universe", () => {
  it("keeps all 64 catalogue worlds backed by a real question generator", () => {
    expect(ARCADE_GAME_CATALOG).toHaveLength(64);
    const missing = ARCADE_GAME_CATALOG.filter((game) => !canGenerateArcadeContent(game.gameKey) && !canGenerateArcadeInteractionContent(game.gameKey) && !canGenerateArcadeResponseContent(game.gameKey) && !canGenerateArcadeWorldContent(game.gameKey));
    expect(missing.map((game) => game.gameKey)).toEqual([]);
  });

  it("keeps every game age-bounded instead of exposing one universal difficulty", () => {
    for (const game of ARCADE_GAME_CATALOG) {
      expect(game.ageBands.length).toBeGreaterThan(0);
      expect(game.standardBands.length).toBeGreaterThan(0);
      expect(game.difficultyMin).toBeGreaterThanOrEqual(1);
      expect(game.difficultyMax).toBeLessThanOrEqual(5);
      expect(game.difficultyMax).toBeGreaterThanOrEqual(game.difficultyMin);
    }
  });

  it("caps challenge depth when a learner intentionally chooses a younger practice band", () => {
    expect(arcadeDifficultyForAge(5, "age_4_5")).toBe(1);
    expect(arcadeDifficultyForAge(5, "age_6_8")).toBe(2);
    expect(arcadeDifficultyForAge(5, "age_9_11")).toBe(3);
    expect(arcadeDifficultyForAge(5, "age_12_14")).toBe(4);
    expect(arcadeDifficultyForAge(5, "age_15_18")).toBe(5);
    expect(arcadeDifficultyForAge(2, "age_15_18")).toBe(2);
  });
});

describe("Arcade variation engine", () => {
  it("prefers unseen concepts from repeated generator attempts and renumbers a round", () => {
    const old = [
      { id: "old-1", prompt: "2 + 2 = ?", answer: "4" },
      { id: "old-2", prompt: "3 + 3 = ?", answer: "6" },
    ];
    const recent = new Set(old.map(arcadeQuestionSignature));
    let attempt = 0;
    const batches = [
      old,
      [
        { id: "new-1", prompt: "4 + 4 = ?", answer: "8" },
        { id: "new-2", prompt: "5 + 5 = ?", answer: "10" },
      ],
    ];
    const varied = buildVariedArcadeQuestionSet(() => batches[Math.min(attempt++, batches.length - 1)], 2, recent, 4);
    expect(varied.questions.map((question) => question.prompt)).toEqual(["4 + 4 = ?", "5 + 5 = ?"]);
    expect(varied.questions.map((question) => question.id)).toEqual(["0", "1"]);
    expect(varied.freshCount).toBe(2);
    expect(varied.reusedCount).toBe(0);
  });

  it("keeps mission framing as metadata so it does not corrupt the learner-facing sentence", () => {
    const base = createArcadeGameQuestions("vocabulary-vault", 3, 1)[0];
    const presented = presentArcadeQuestionForAge(base, "age_12_14", "mission-one", 0);
    const history = arcadeQuestionHistorySignatures([{ questions: [presented] }]);
    expect(history.has(arcadeQuestionSignature(base))).toBe(true);
    expect(presented.answer).toBe(base.answer);
    expect(presented.prompt).toBe(base.prompt);
    expect(presented.prompt).not.toContain(" · ");
    expect(presented.conceptKey).toBe(arcadeQuestionSignature(base));
    expect(presented.presentationVariant.length).toBeGreaterThan(0);
  });

  it("only falls back to spaced repetition after fresh unique candidates are exhausted", () => {
    const repeated = { id: "a", prompt: "Known concept", answer: "A" };
    const fresh = { id: "b", prompt: "Fresh concept", answer: "B" };
    const history = new Set([arcadeQuestionSignature(repeated)]);
    let attempt = 0;
    const result = buildVariedArcadeQuestionSet(() => attempt++ === 0 ? [repeated] : [fresh, repeated], 2, history, 3);
    expect(result.questions[0].prompt).toBe("Fresh concept");
    expect(result.questions[1].prompt).toBe("Known concept");
    expect(result.freshCount).toBe(1);
    expect(result.reusedCount).toBe(1);
  });
});
