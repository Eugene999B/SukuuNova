import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { effectiveArcadeCatalog } from "../src/lib/arcade-settings";
import {
  PLAYABLE_ARCADE_GAME_KEYS,
  createArcadeGameQuestions,
  nextDifficulty,
  type ArcadeQuestion,
} from "../src/lib/arcade-content";
import { guardianArcadeLeaderboard, saveArcadeRound, startArcadeRound } from "../src/lib/arcade-service";

async function setupPrimaryFive() {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async (tx) => {
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Primary Five", level: "Primary 5" } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Arcade Pack Guardian", userId: fixture.memberId } });
    const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name: "Akosua Owusu", admissionNo: "A2-P5" } });
    await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, guardianId: guardian.id, studentId: student.id, relationship: "Parent" } });
    return { classId: classroom.id, guardianId: guardian.id, studentId: student.id };
  });
  return {
    ...fixture,
    ...ids,
    context: { schoolId: fixture.schoolId, guardianId: ids.guardianId, userId: fixture.memberId },
  };
}

function assertQuestionQuality(questions: ArcadeQuestion[], expectedLength: number) {
  expect(questions).toHaveLength(expectedLength);
  for (const item of questions) {
    expect(item.prompt.trim().length).toBeGreaterThan(3);
    expect(item.explanation.trim().length).toBeGreaterThan(5);
    expect(item.options).toHaveLength(4);
    expect(new Set(item.options).size).toBe(4);
    expect(item.options.filter((option) => option === item.answer)).toHaveLength(1);
  }
}

describe("Arcade Universe A2 content pack", () => {
  it("has thirteen server-generated base packs across difficulty 1–5", () => {
    expect(PLAYABLE_ARCADE_GAME_KEYS).toHaveLength(13);
    expect(new Set(PLAYABLE_ARCADE_GAME_KEYS).size).toBe(13);
    for (const game of PLAYABLE_ARCADE_GAME_KEYS) {
      for (const difficulty of [1, 2, 3, 4, 5]) {
        assertQuestionQuality(createArcadeGameQuestions(game, difficulty, 5), 5);
      }
    }
  });

  it("generates longer rounds without changing answer-key privacy semantics", () => {
    for (const game of ["addition-dash", "times-table-turbo", "vocabulary-vault", "earth-weather"] as const) {
      assertQuestionQuality(createArcadeGameQuestions(game, 3, 10), 10);
      assertQuestionQuality(createArcadeGameQuestions(game, 4, 15), 15);
    }
  });

  it("uses percentage accuracy for adaptive difficulty on variable-length rounds", () => {
    expect(nextDifficulty(2, [
      { difficulty: 2, correct: 8, roundLength: 10 },
      { difficulty: 2, correct: 9, roundLength: 10 },
      { difficulty: 2, correct: 10, roundLength: 10 },
    ])).toBe(3);
    expect(nextDifficulty(3, [
      { difficulty: 3, correct: 4, roundLength: 10 },
      { difficulty: 3, correct: 3, roundLength: 10 },
    ])).toBe(2);
    expect(nextDifficulty(4, [
      { difficulty: 4, correct: 7, roundLength: 10 },
      { difficulty: 4, correct: 9, roundLength: 10 },
      { difficulty: 4, correct: 10, roundLength: 10 },
    ])).toBe(4);
  });

  it("keeps all thirteen A2 base packs live as the larger universe expands", async () => {
    const fixture = await createTenantFixture();
    const catalog = await withTenant(fixture.schoolId, (tx) => effectiveArcadeCatalog(tx, fixture.schoolId));
    expect(catalog).toHaveLength(64);
    const liveKeys = new Set(catalog.filter((game) => game.live).map((game) => game.gameKey));
    for (const gameKey of PLAYABLE_ARCADE_GAME_KEYS) expect(liveKeys.has(gameKey)).toBe(true);
    expect(catalog.find((game) => game.gameKey === "money-math-market")).toMatchObject({ live: false, enabled: false });
  });

  it("plays and ranks a ten-question Times Table Turbo round for a suitable learner", async () => {
    const fixture = await setupPrimaryFive();
    const round = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId,
      game: "times-table-turbo",
      ageBand: "age_9_11",
      roundLength: 10,
    }));
    expect(round).toMatchObject({
      game: "times-table-turbo",
      difficulty: 2,
      roundLength: 10,
      ageBand: "age_9_11",
      standardBand: "basic_4_6",
      engine: "rapid_fire",
      status: "in_progress",
    });
    expect(round.questions).toHaveLength(10);
    expect(round.questions.every((item) => !("answer" in item) && !("explanation" in item))).toBe(true);

    const answers = await withTenant(fixture.schoolId, async (tx) => {
      const stored = await tx.arcadeRound.findFirstOrThrow({ where: { id: round.id } });
      return (stored.questions as unknown as ArcadeQuestion[]).map((item) => item.answer);
    });
    const completed = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers, finish: true }));
    expect(completed).toMatchObject({ correct: 10, xp: 100, stars: 3, score: 10200, roundLength: 10 });
    expect(completed.questions.every((item) => Boolean(item.answer) && Boolean(item.explanation))).toBe(true);

    const snapshot = await withTenant(fixture.schoolId, (tx) => tx.$queryRaw<Array<{ settingsSnapshot: unknown; roundLength: number; score: number }>>`
      SELECT "settingsSnapshot","roundLength","score" FROM "ArcadeRound" WHERE "id"=${round.id}
    `);
    expect(snapshot[0]).toMatchObject({ roundLength: 10, score: 10200 });
    expect(snapshot[0].settingsSnapshot).toMatchObject({ version: 1, gameKey: "times-table-turbo", roundLength: 10, standardBand: "basic_4_6", ageBand: "age_9_11" });

    const board = await withTenant(fixture.schoolId, (tx) => guardianArcadeLeaderboard(tx, fixture.context, {
      studentId: fixture.studentId,
      game: "times-table-turbo",
      scope: "standard",
      period: "all",
      ageBand: "age_9_11",
    }));
    expect(board.rows[0]).toMatchObject({ rank: 1, studentId: fixture.studentId, displayName: "Akosua O.", bestScore: 10200, totalXp: 100, rounds: 1 });
  });

  it("keeps content packs without a supported interaction renderer disabled", async () => {
    const fixture = await setupPrimaryFive();
    await expect(withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId,
      game: "money-math-market",
      ageBand: "age_9_11",
    }))).rejects.toMatchObject({ code: "GAME_NOT_AVAILABLE", status: 409 });
  });
});
