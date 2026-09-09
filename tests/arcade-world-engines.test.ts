import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { ARCADE_GAME_KEYS } from "../src/lib/arcade-catalog";
import { PLAYABLE_ARCADE_GAME_KEYS } from "../src/lib/arcade-content";
import { INTERACTION_ARCADE_GAME_KEYS } from "../src/lib/arcade-interaction-content";
import { RESPONSE_ARCADE_GAME_KEYS } from "../src/lib/arcade-response-content";
import {
  WORLD_ARCADE_GAME_KEYS,
  correctArcadeWorldAnswer,
  createArcadeWorldQuestions,
  validArcadeWorldAnswer,
  type ArcadeWorldQuestion,
} from "../src/lib/arcade-world-content";
import { effectiveArcadeCatalog } from "../src/lib/arcade-settings";
import { saveArcadeRound, startArcadeRound } from "../src/lib/arcade-service";

async function setup(level: string, name = "Arcade World Learner") {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async (tx) => {
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: `${level} World Arcade`, level } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "World Guardian", userId: fixture.memberId } });
    const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name, admissionNo: `A5-${level.replace(/\s+/g, "-")}-${name.replace(/\s+/g, "-")}` } });
    await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, guardianId: guardian.id, studentId: student.id, relationship: "Parent" } });
    return { classId: classroom.id, guardianId: guardian.id, studentId: student.id };
  });
  return { ...fixture, ...ids, context: { schoolId: fixture.schoolId, guardianId: ids.guardianId, userId: fixture.memberId } };
}

async function storedQuestions(schoolId: string, roundId: string) {
  return withTenant(schoolId, async (tx) => {
    const stored = await tx.arcadeRound.findFirstOrThrow({ where: { id: roundId } });
    return stored.questions as unknown as ArcadeWorldQuestion[];
  });
}

describe("Arcade Universe A5 physical world engines", () => {
  it("ships twenty-four final packs across existing and physical world engines", () => {
    expect(WORLD_ARCADE_GAME_KEYS).toHaveLength(24);
    expect(new Set(WORLD_ARCADE_GAME_KEYS).size).toBe(24);
    const expectedKind = new Map<string, ArcadeWorldQuestion["kind"]>([
      ["ratio-race", "choice_plus"], ["money-math-market", "simulation"], ["data-detective", "choice_plus"], ["letter-hunt", "grid"],
      ["sound-match", "match_plus"], ["reading-detective", "choice_plus"], ["tense-trek", "choice_plus"], ["essay-planner", "sort_plus"],
      ["force-motion-lab", "simulation"], ["energy-quest", "choice_plus"], ["space-explorer", "map"], ["ghana-map-master", "map"],
      ["africa-explorer", "map"], ["world-flags-capitals", "match_plus"], ["history-timeline", "sort_plus"], ["culture-heritage", "match_plus"],
      ["environment-guardian", "simulation"], ["cyber-safety", "simulation"], ["memory-matrix", "memory"], ["logic-grid-lite", "grid"],
      ["budget-boss", "simulation"], ["healthy-choices", "simulation"], ["road-safety", "simulation"], ["entrepreneurship-simulator", "simulation"],
    ]);
    for (const game of WORLD_ARCADE_GAME_KEYS) {
      for (const difficulty of [1, 2, 3, 4, 5]) {
        const questions = createArcadeWorldQuestions(game, difficulty, 3);
        expect(questions).toHaveLength(3);
        for (const item of questions) {
          expect(item.kind).toBe(expectedKind.get(game));
          expect(item.prompt.trim().length).toBeGreaterThan(4);
          expect(item.explanation.trim().length).toBeGreaterThan(5);
          expect(validArcadeWorldAnswer(item, item.answer)).toBe(true);
          expect(correctArcadeWorldAnswer(item, item.answer)).toBe(true);
          expect(item.options.length).toBeGreaterThanOrEqual(4);
          expect(new Set(item.options).size).toBe(item.options.length);
          if (item.kind === "map") {
            expect(item.scene?.x).toBeGreaterThanOrEqual(0);
            expect(item.scene?.x).toBeLessThanOrEqual(100);
            expect(item.scene?.y).toBeGreaterThanOrEqual(0);
            expect(item.scene?.y).toBeLessThanOrEqual(100);
          }
          if (item.kind === "simulation") expect(item.scene?.meterLabels).toHaveLength(3);
          if (item.kind === "grid") expect(item.scene?.cells).toEqual(item.options);
        }
      }
    }
  });

  it("rejects forged or duplicate order tiles while accepting a real but incorrect permutation", () => {
    const item = createArcadeWorldQuestions("essay-planner", 3, 1)[0];
    expect(item.kind).toBe("sort_plus");
    const correct = JSON.parse(item.answer) as string[];
    const reversed = JSON.stringify([...correct].reverse());
    const duplicate = JSON.stringify(correct.map((value, index) => index === correct.length - 1 ? correct[0] : value));
    const forged = JSON.stringify([...correct.slice(1), "forged step"]);
    expect(validArcadeWorldAnswer(item, item.answer)).toBe(true);
    expect(validArcadeWorldAnswer(item, reversed)).toBe(true);
    expect(correctArcadeWorldAnswer(item, reversed)).toBe(false);
    expect(validArcadeWorldAnswer(item, duplicate)).toBe(false);
    expect(validArcadeWorldAnswer(item, forged)).toBe(false);
  });

  it("makes the complete 64-game catalogue runtime-ready without duplicate keys", async () => {
    const fixture = await createTenantFixture();
    const catalog = await withTenant(fixture.schoolId, (tx) => effectiveArcadeCatalog(tx, fixture.schoolId));
    const liveKeys = catalog.filter((game) => game.live).map((game) => game.gameKey);
    const expected = [...PLAYABLE_ARCADE_GAME_KEYS, ...INTERACTION_ARCADE_GAME_KEYS, ...RESPONSE_ARCADE_GAME_KEYS, ...WORLD_ARCADE_GAME_KEYS];
    expect(ARCADE_GAME_KEYS).toHaveLength(64);
    expect(new Set(ARCADE_GAME_KEYS).size).toBe(64);
    expect(expected).toHaveLength(64);
    expect(new Set(expected).size).toBe(64);
    expect(catalog).toHaveLength(64);
    expect(liveKeys).toHaveLength(64);
    expect(new Set(liveKeys)).toEqual(new Set(ARCADE_GAME_KEYS));
    expect(new Set(expected)).toEqual(new Set(ARCADE_GAME_KEYS));
  });

  it("plays a grid-hunt round with scene data visible but answer keys private", async () => {
    const fixture = await setup("KG 2", "Akosua Grid");
    const round = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "letter-hunt", ageBand: "age_4_5", roundLength: 5,
    }));
    expect(round).toMatchObject({ engine: "grid_hunt", difficulty: 1, standardBand: "kg", ageBand: "age_4_5", roundLength: 5 });
    expect(round.questions.every((item) => item.kind === "grid" && Boolean(item.scene) && !("answer" in item) && !("explanation" in item) && !("correct" in item))).toBe(true);
    const questions = await storedQuestions(fixture.schoolId, round.id);
    const answers = questions.map((item) => item.answer);
    const completed = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers, finish: true }));
    expect(completed).toMatchObject({ correct: 5, xp: 50, stars: 3, score: 10100 });
    expect(completed.questions.every((item) => item.correct === true && Boolean(item.explanation))).toBe(true);
  });

  it("plays a schematic map round with pin coordinates but no pre-completion answer leakage", async () => {
    const fixture = await setup("Primary 5", "Yaw Mapper");
    const round = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "ghana-map-master", ageBand: "age_9_11", roundLength: 5,
    }));
    expect(round).toMatchObject({ engine: "map_label", difficulty: 2, standardBand: "basic_4_6", ageBand: "age_9_11" });
    expect(round.questions.every((item) => item.kind === "map" && Boolean(item.scene) && !("answer" in item) && !("correct" in item))).toBe(true);
    const questions = await storedQuestions(fixture.schoolId, round.id);
    for (const question of questions) {
      expect(question.scene?.boardTitle).toContain("Ghana");
      expect(JSON.stringify(question.scene)).not.toContain(question.answer);
    }
    const answers = questions.map((item, index) => index === 0 ? item.options.find((option) => option !== item.answer)! : item.answer);
    const completed = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers, finish: true }));
    expect(completed).toMatchObject({ correct: 4, xp: 40, stars: 2, score: 8200 });
    expect(completed.questions[0].correct).toBe(false);
    expect(completed.questions.slice(1).every((item) => item.correct === true)).toBe(true);
  });

  it("saves and resumes a memory-flip round without revealing the matched card answer", async () => {
    const fixture = await setup("Primary 5", "Esi Memory");
    const round = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "memory-matrix", ageBand: "age_9_11", roundLength: 5,
    }));
    expect(round).toMatchObject({ engine: "memory_flip", difficulty: 2 });
    expect(round.questions.every((item) => item.kind === "memory" && !("answer" in item))).toBe(true);
    const questions = await storedQuestions(fixture.schoolId, round.id);
    const correct = questions.map((item) => item.answer);
    const draft = [correct[0], "", "", "", ""];
    await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers: draft, finish: false }));
    const resumed = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "memory-matrix", ageBand: "age_9_11", roundLength: 5,
    }));
    expect(resumed.id).toBe(round.id);
    expect(resumed.answers).toEqual(draft);
    expect(resumed.questions.every((item) => !("answer" in item) && !("correct" in item))).toBe(true);
    const completed = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers: correct, finish: true }));
    expect(completed.correct).toBe(5);
  });

  it("runs simulation decisions through secure grading and preserves school disable authority", async () => {
    const fixture = await setup("JHS 1", "Kofi Simulator");
    const round = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "budget-boss", ageBand: "age_12_14", roundLength: 5,
    }));
    expect(round).toMatchObject({ engine: "simulation", difficulty: 3, standardBand: "jhs", ageBand: "age_12_14" });
    expect(round.questions.every((item) => item.kind === "simulation" && Boolean(item.scene) && !("answer" in item) && !("explanation" in item))).toBe(true);
    const questions = await storedQuestions(fixture.schoolId, round.id);
    const answers = questions.map((item) => item.answer);
    const completed = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers, finish: true }));
    expect(completed).toMatchObject({ correct: 5, xp: 50, stars: 3, score: 10300 });

    await withTenant(fixture.schoolId, (tx) => tx.$executeRaw`
      INSERT INTO "ArcadeGameSetting" ("id","schoolId","gameKey","enabled") VALUES (${createId()},${fixture.schoolId},'cyber-safety',FALSE)
    `);
    const catalog = await withTenant(fixture.schoolId, (tx) => effectiveArcadeCatalog(tx, fixture.schoolId));
    expect(catalog.find((game) => game.gameKey === "cyber-safety")).toMatchObject({ live: true, enabled: false });
    await expect(withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "cyber-safety", ageBand: "age_12_14",
    }))).rejects.toMatchObject({ code: "GAME_NOT_AVAILABLE", status: 409 });
  });
});
