import { describe, expect, it } from "vitest";
import { chooseVariedArcadeMissions } from "../src/lib/arcade-recommendations";

const games = [
  { gameKey: "math-a", category: "Mathematics", engine: "rapid_fire" },
  { gameKey: "math-b", category: "Mathematics", engine: "choice_quiz" },
  { gameKey: "word-a", category: "Literacy", engine: "choice_quiz" },
  { gameKey: "science-a", category: "Science", engine: "simulation" },
  { gameKey: "logic-a", category: "Logic", engine: "grid_hunt" },
];

describe("Arcade mission recommendation diversity", () => {
  it("prefers different categories and engines in the three-card mission deck", () => {
    const selected = chooseVariedArcadeMissions(games, [], [], 3);
    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((game) => game.category)).size).toBe(3);
    expect(new Set(selected.map((game) => game.engine)).size).toBe(3);
  });

  it("moves very recent games behind equally suitable fresh worlds", () => {
    const selected = chooseVariedArcadeMissions(games, [], [{ game: "math-a" }, { game: "word-a" }], 3);
    expect(selected.map((game) => game.gameKey)).not.toContain("math-a");
    expect(selected[0].gameKey).toBe("math-b");
  });

  it("balances support with novelty instead of trapping a learner in one weak game", () => {
    const selected = chooseVariedArcadeMissions(games, [
      { game: "math-a", rounds: 1, accuracy: 35 },
      { game: "word-a", rounds: 0, accuracy: null },
      { game: "science-a", rounds: 0, accuracy: null },
    ], [], 3);
    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((game) => game.category)).size).toBe(3);
  });

  it("never returns duplicates and respects requested deck size", () => {
    const selected = chooseVariedArcadeMissions(games, [], [], 4);
    expect(selected).toHaveLength(4);
    expect(new Set(selected.map((game) => game.gameKey)).size).toBe(4);
  });
});
