import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { PLAYABLE_ARCADE_GAME_KEYS } from "../src/lib/arcade-content";
import {
  INTERACTION_ARCADE_GAME_KEYS,
  correctArcadeInteractionAnswer,
  createArcadeInteractionQuestions,
  validArcadeInteractionAnswer,
  type ArcadeInteractionQuestion,
} from "../src/lib/arcade-interaction-content";
import { effectiveArcadeCatalog } from "../src/lib/arcade-settings";
import { guardianArcadeLeaderboard, saveArcadeRound, startArcadeRound } from "../src/lib/arcade-service";

async function setup(level: string, name = "Arcade Interaction Learner") {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async (tx) => {
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: `${level} Arcade`, level } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Interaction Guardian", userId: fixture.memberId } });
    const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name, admissionNo: `A3-${level.replace(/\s+/g, "-")}` } });
    await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, guardianId: guardian.id, studentId: student.id, relationship: "Parent" } });
    return { classId: classroom.id, guardianId: guardian.id, studentId: student.id };
  });
  return { ...fixture, ...ids, context: { schoolId: fixture.schoolId, guardianId: ids.guardianId, userId: fixture.memberId } };
}

async function storedQuestions(schoolId: string, roundId: string) {
  return withTenant(schoolId, async (tx) => {
    const stored = await tx.arcadeRound.findFirstOrThrow({ where: { id: roundId } });
    return stored.questions as unknown as ArcadeInteractionQuestion[];
  });
}

describe("Arcade Universe A3 interaction engines", () => {
  it("ships fifteen interaction packs across match, sort and classify engines", () => {
    expect(INTERACTION_ARCADE_GAME_KEYS).toHaveLength(15);
    expect(new Set(INTERACTION_ARCADE_GAME_KEYS).size).toBe(15);
    const expectedKind = new Map<string, ArcadeInteractionQuestion["kind"]>([
      ["count-match", "match"], ["measurement-master", "match"], ["synonym-switch", "match"], ["antonym-arena", "match"],
      ["body-explorer", "match"], ["regions-capitals", "match"], ["hardware-match", "match"], ["chemistry-symbol-match", "match"],
      ["sentence-scramble", "sort"], ["food-chain-builder", "sort"], ["coding-sequence", "sort"], ["sequence-lab", "sort"],
      ["geometry-builder", "classify"], ["living-nonliving", "classify"], ["matter-sort", "classify"],
    ]);
    for (const game of INTERACTION_ARCADE_GAME_KEYS) {
      for (const difficulty of [1, 2, 3, 4, 5]) {
        const questions = createArcadeInteractionQuestions(game, difficulty, 3);
        expect(questions).toHaveLength(3);
        for (const item of questions) {
          expect(item.kind).toBe(expectedKind.get(game));
          expect(item.prompt.trim().length).toBeGreaterThan(2);
          expect(item.explanation.trim().length).toBeGreaterThan(5);
          expect(item.options.length).toBeGreaterThanOrEqual(2);
          expect(new Set(item.options).size).toBe(item.options.length);
          expect(validArcadeInteractionAnswer(item, item.answer)).toBe(true);
          expect(correctArcadeInteractionAnswer(item, item.answer)).toBe(true);
        }
      }
    }
  });

  it("accepts only real permutations for sort answers and grades order exactly", () => {
    const item = createArcadeInteractionQuestions("coding-sequence", 3, 1)[0];
    expect(item.kind).toBe("sort");
    const correct = JSON.parse(item.answer) as string[];
    const reversed = JSON.stringify([...correct].reverse());
    const duplicate = JSON.stringify(correct.map((value, index) => index === correct.length - 1 ? correct[0] : value));
    const forged = JSON.stringify([...correct.slice(1), "forged tile"]);
    expect(validArcadeInteractionAnswer(item, item.answer)).toBe(true);
    expect(validArcadeInteractionAnswer(item, reversed)).toBe(true);
    expect(correctArcadeInteractionAnswer(item, reversed)).toBe(false);
    expect(validArcadeInteractionAnswer(item, duplicate)).toBe(false);
    expect(validArcadeInteractionAnswer(item, forged)).toBe(false);
  });

  it("exposes twenty-eight live packs while preserving the full 64-game catalogue", async () => {
    const fixture = await createTenantFixture();
    const catalog = await withTenant(fixture.schoolId, (tx) => effectiveArcadeCatalog(tx, fixture.schoolId));
    const liveKeys = catalog.filter((game) => game.live).map((game) => game.gameKey);
    expect(catalog).toHaveLength(64);
    expect(liveKeys).toHaveLength(28);
    expect(new Set(liveKeys)).toEqual(new Set([...PLAYABLE_ARCADE_GAME_KEYS, ...INTERACTION_ARCADE_GAME_KEYS]));
    expect(catalog.find((game) => game.gameKey === "money-math-market")).toMatchObject({ live: false, enabled: false });
  });

  it("plays a match-pairs round without exposing answers before completion", async () => {
    const fixture = await setup("Primary 1", "Nana Match");
    const round = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "count-match", ageBand: "age_6_8", roundLength: 5,
    }));
    expect(round).toMatchObject({ engine: "match_pairs", roundLength: 5, difficulty: 1, standardBand: "basic_1_3", ageBand: "age_6_8" });
    expect(round.questions.every((item) => item.kind === "match" && !("answer" in item) && !("explanation" in item))).toBe(true);
    const questions = await storedQuestions(fixture.schoolId, round.id);
    const answers = questions.map((item) => item.answer);
    const completed = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers, finish: true }));
    expect(completed).toMatchObject({ correct: 5, xp: 50, stars: 3, score: 10100 });
    expect(completed.questions.every((item) => item.kind === "match" && Boolean(item.answer) && Boolean(item.explanation))).toBe(true);
  });

  it("saves, resumes and securely grades a sort-sequence round", async () => {
    const fixture = await setup("Primary 5", "Abena Sequence");
    const round = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "sentence-scramble", ageBand: "age_9_11", roundLength: 5,
    }));
    expect(round).toMatchObject({ engine: "sort_sequence", roundLength: 5, difficulty: 2, standardBand: "basic_4_6" });
    expect(round.questions.every((item) => item.kind === "sort" && !("answer" in item))).toBe(true);
    const questions = await storedQuestions(fixture.schoolId, round.id);
    const correct = questions.map((item) => item.answer);
    const draft = [correct[0], "", "", "", ""];
    await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers: draft, finish: false }));
    const resumed = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "sentence-scramble", ageBand: "age_9_11", roundLength: 5,
    }));
    expect(resumed.id).toBe(round.id);
    expect(resumed.answers).toEqual(draft);

    const firstOrder = JSON.parse(correct[0]) as string[];
    const forgedFirst = JSON.stringify(firstOrder.map((value, index) => index === firstOrder.length - 1 ? firstOrder[0] : value));
    await expect(withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, {
      roundId: round.id, answers: [forgedFirst, ...correct.slice(1)], finish: true,
    }))).rejects.toMatchObject({ code: "INVALID_ANSWERS" });

    const completed = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers: correct, finish: true }));
    expect(completed).toMatchObject({ correct: 5, xp: 50, stars: 3, score: 10200 });
    const board = await withTenant(fixture.schoolId, (tx) => guardianArcadeLeaderboard(tx, fixture.context, {
      studentId: fixture.studentId, game: "sentence-scramble", scope: "standard", period: "all", ageBand: "age_9_11",
    }));
    expect(board.rows[0]).toMatchObject({ rank: 1, studentId: fixture.studentId, displayName: "Abena S.", bestScore: 10200, totalXp: 50, rounds: 1 });
  });

  it("plays a classification round and keeps school disable controls authoritative", async () => {
    const fixture = await setup("Primary 5", "Kojo Classify");
    const round = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "geometry-builder", ageBand: "age_9_11", roundLength: 5,
    }));
    expect(round).toMatchObject({ engine: "classify_buckets", difficulty: 2 });
    expect(round.questions.every((item) => item.kind === "classify")).toBe(true);
    const questions = await storedQuestions(fixture.schoolId, round.id);
    const answers = questions.map((item) => item.answer);
    const completed = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers, finish: true }));
    expect(completed.correct).toBe(5);

    await withTenant(fixture.schoolId, (tx) => tx.$executeRaw`
      INSERT INTO "ArcadeGameSetting" ("id","schoolId","gameKey","enabled") VALUES (${createId()},${fixture.schoolId},'matter-sort',FALSE)
    `);
    const catalog = await withTenant(fixture.schoolId, (tx) => effectiveArcadeCatalog(tx, fixture.schoolId));
    expect(catalog.find((game) => game.gameKey === "matter-sort")).toMatchObject({ live: true, enabled: false });
    await expect(withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "matter-sort", ageBand: "age_9_11",
    }))).rejects.toMatchObject({ code: "GAME_NOT_AVAILABLE", status: 409 });
  });
});
