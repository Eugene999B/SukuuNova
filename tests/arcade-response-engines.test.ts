import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { PLAYABLE_ARCADE_GAME_KEYS } from "../src/lib/arcade-content";
import { INTERACTION_ARCADE_GAME_KEYS } from "../src/lib/arcade-interaction-content";
import {
  RESPONSE_ARCADE_GAME_KEYS,
  correctArcadeResponseAnswer,
  createArcadeResponseQuestions,
  validArcadeResponseAnswer,
  type ArcadeResponseQuestion,
} from "../src/lib/arcade-response-content";
import { effectiveArcadeCatalog } from "../src/lib/arcade-settings";
import { saveArcadeRound, startArcadeRound } from "../src/lib/arcade-service";

async function setup(level: string, name = "Arcade Response Learner") {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async (tx) => {
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: `${level} Arcade`, level } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Response Guardian", userId: fixture.memberId } });
    const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name, admissionNo: `A4-${level.replace(/\s+/g, "-")}-${name.replace(/\s+/g, "-")}` } });
    await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, guardianId: guardian.id, studentId: student.id, relationship: "Parent" } });
    return { classId: classroom.id, guardianId: guardian.id, studentId: student.id };
  });
  return { ...fixture, ...ids, context: { schoolId: fixture.schoolId, guardianId: ids.guardianId, userId: fixture.memberId } };
}

async function storedQuestions(schoolId: string, roundId: string) {
  return withTenant(schoolId, async (tx) => {
    const stored = await tx.arcadeRound.findFirstOrThrow({ where: { id: roundId } });
    return stored.questions as unknown as ArcadeResponseQuestion[];
  });
}

describe("Arcade Universe A4 response engines", () => {
  it("ships twelve response packs across path, tile-builder and typed engines", () => {
    expect(RESPONSE_ARCADE_GAME_KEYS).toHaveLength(12);
    expect(new Set(RESPONSE_ARCADE_GAME_KEYS).size).toBe(12);
    const expectedKind = new Map<string, ArcadeResponseQuestion["kind"]>([
      ["subtraction-rescue", "path"], ["equation-escape", "path"], ["comprehension-quest", "path"],
      ["circuit-logic", "path"], ["civic-duty", "path"], ["file-folder-quest", "path"], ["puzzle-path", "path"],
      ["fraction-forge", "build"], ["punctuation-patrol", "build"], ["binary-basics", "build"],
      ["spelling-sprint", "typed"], ["keyboard-ninja", "typed"],
    ]);

    for (const game of RESPONSE_ARCADE_GAME_KEYS) {
      for (const difficulty of [1, 2, 3, 4, 5]) {
        const questions = createArcadeResponseQuestions(game, difficulty, 3);
        expect(questions).toHaveLength(3);
        for (const item of questions) {
          expect(item.kind).toBe(expectedKind.get(game));
          expect(item.prompt.trim().length).toBeGreaterThan(4);
          expect(item.explanation.trim().length).toBeGreaterThan(5);
          expect(validArcadeResponseAnswer(item, item.answer)).toBe(true);
          expect(correctArcadeResponseAnswer(item, item.answer)).toBe(true);
          if (item.kind === "path") expect(new Set(item.options).size).toBe(item.options.length);
          if (item.kind === "typed") expect(item.options).toEqual([]);
        }
      }
    }
  });

  it("accepts only real tile permutations and grades tile order exactly", () => {
    const item = createArcadeResponseQuestions("fraction-forge", 3, 1)[0];
    expect(item.kind).toBe("build");
    const correct = JSON.parse(item.answer) as string[];
    const reversed = JSON.stringify([...correct].reverse());
    const duplicate = JSON.stringify(correct.map((value, index) => index === correct.length - 1 ? correct[0] : value));
    const forged = JSON.stringify([...correct.slice(1), "forged tile"]);
    expect(validArcadeResponseAnswer(item, item.answer)).toBe(true);
    expect(validArcadeResponseAnswer(item, reversed)).toBe(true);
    expect(correctArcadeResponseAnswer(item, reversed)).toBe(false);
    expect(validArcadeResponseAnswer(item, duplicate)).toBe(false);
    expect(validArcadeResponseAnswer(item, forged)).toBe(false);
  });

  it("keeps spelling forgiving but keyboard-copy grading exact", () => {
    const spelling = createArcadeResponseQuestions("spelling-sprint", 2, 1)[0];
    expect(spelling.kind).toBe("typed");
    expect(correctArcadeResponseAnswer(spelling, `  ${spelling.answer.toUpperCase()}  `)).toBe(true);
    expect(validArcadeResponseAnswer(spelling, "   ")).toBe(false);

    const keyboard = createArcadeResponseQuestions("keyboard-ninja", 2, 1)[0];
    expect(keyboard.kind).toBe("typed");
    expect(keyboard.caseSensitive).toBe(true);
    expect(correctArcadeResponseAnswer(keyboard, keyboard.answer)).toBe(true);
    expect(correctArcadeResponseAnswer(keyboard, keyboard.answer.toLocaleLowerCase())).toBe(keyboard.answer === keyboard.answer.toLocaleLowerCase());
  });

  it("exposes exactly forty runtime-ready packs while preserving the 64-game catalogue", async () => {
    const fixture = await createTenantFixture();
    const catalog = await withTenant(fixture.schoolId, (tx) => effectiveArcadeCatalog(tx, fixture.schoolId));
    const liveKeys = catalog.filter((game) => game.live).map((game) => game.gameKey);
    const expected = [...PLAYABLE_ARCADE_GAME_KEYS, ...INTERACTION_ARCADE_GAME_KEYS, ...RESPONSE_ARCADE_GAME_KEYS];
    expect(catalog).toHaveLength(64);
    expect(expected).toHaveLength(40);
    expect(new Set(expected).size).toBe(40);
    expect(liveKeys).toHaveLength(40);
    expect(new Set(liveKeys)).toEqual(new Set(expected));
  });

  it("plays a path-choice round privately and returns authoritative per-task grading only after completion", async () => {
    const fixture = await setup("Primary 1", "Nana Path");
    const round = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "subtraction-rescue", ageBand: "age_6_8", roundLength: 5,
    }));
    expect(round).toMatchObject({ engine: "path_choice", difficulty: 1, standardBand: "basic_1_3", ageBand: "age_6_8", roundLength: 5 });
    expect(round.questions.every((item) => item.kind === "path" && !("answer" in item) && !("explanation" in item) && !("correct" in item))).toBe(true);

    const questions = await storedQuestions(fixture.schoolId, round.id);
    const answers = questions.map((item, index) => index === 0 ? item.options.find((option) => option !== item.answer)! : item.answer);
    const completed = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers, finish: true }));
    expect(completed).toMatchObject({ correct: 4, xp: 40, stars: 2, score: 8100 });
    expect(completed.questions[0]).toMatchObject({ kind: "path", correct: false });
    expect(completed.questions.slice(1).every((item) => item.correct === true)).toBe(true);
    expect(completed.questions.every((item) => Boolean(item.answer) && Boolean(item.explanation))).toBe(true);
  });

  it("saves and resumes a tile-builder round and rejects duplicate or forged tiles", async () => {
    const fixture = await setup("Primary 5", "Abena Builder");
    const round = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "fraction-forge", ageBand: "age_9_11", roundLength: 5,
    }));
    expect(round).toMatchObject({ engine: "tile_builder", difficulty: 2, standardBand: "basic_4_6", roundLength: 5 });
    expect(round.questions.every((item) => item.kind === "build" && !("answer" in item))).toBe(true);

    const questions = await storedQuestions(fixture.schoolId, round.id);
    const correct = questions.map((item) => item.answer);
    const firstOrder = JSON.parse(correct[0]) as string[];
    const reversedFirst = JSON.stringify([...firstOrder].reverse());
    const draft = [reversedFirst, "", "", "", ""];
    await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers: draft, finish: false }));
    const resumed = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "fraction-forge", ageBand: "age_9_11", roundLength: 5,
    }));
    expect(resumed.id).toBe(round.id);
    expect(resumed.answers).toEqual(draft);

    const duplicate = JSON.stringify(firstOrder.map((value, index) => index === firstOrder.length - 1 ? firstOrder[0] : value));
    await expect(withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, {
      roundId: round.id, answers: [duplicate, ...correct.slice(1)], finish: true,
    }))).rejects.toMatchObject({ code: "INVALID_ANSWERS", status: 400 });

    const completed = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: round.id, answers: correct, finish: true }));
    expect(completed).toMatchObject({ correct: 5, xp: 50, stars: 3, score: 10200 });
    expect(completed.questions.every((item) => item.correct === true)).toBe(true);
  });

  it("grades typed spelling case-insensitively and exact keyboard-copy tasks case-sensitively", async () => {
    const fixture = await setup("Primary 5", "Kojo Typist");
    const spellingRound = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "spelling-sprint", ageBand: "age_9_11", roundLength: 5,
    }));
    expect(spellingRound).toMatchObject({ engine: "typed_response", difficulty: 2 });
    expect(spellingRound.questions.every((item) => item.kind === "typed" && !("answer" in item) && !("correct" in item))).toBe(true);
    const spellingQuestions = await storedQuestions(fixture.schoolId, spellingRound.id);
    const spellingAnswers = spellingQuestions.map((item) => item.answer.toUpperCase());
    const spellingCompleted = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: spellingRound.id, answers: spellingAnswers, finish: true }));
    expect(spellingCompleted.correct).toBe(5);
    expect(spellingCompleted.questions.every((item) => item.correct === true)).toBe(true);

    const keyboardRound = await withTenant(fixture.schoolId, (tx) => startArcadeRound(tx, fixture.context, {
      studentId: fixture.studentId, game: "keyboard-ninja", ageBand: "age_9_11", roundLength: 5,
    }));
    const keyboardQuestions = await storedQuestions(fixture.schoolId, keyboardRound.id);
    const keyboardAnswers = keyboardQuestions.map((item, index) => index === 0 ? item.answer.toLocaleLowerCase() : item.answer);
    const expectedCorrect = keyboardQuestions[0].answer === keyboardQuestions[0].answer.toLocaleLowerCase() ? 5 : 4;
    const keyboardCompleted = await withTenant(fixture.schoolId, (tx) => saveArcadeRound(tx, fixture.context, { roundId: keyboardRound.id, answers: keyboardAnswers, finish: true }));
    expect(keyboardCompleted.correct).toBe(expectedCorrect);
    expect(keyboardCompleted.questions[0].correct).toBe(expectedCorrect === 5);
    expect(keyboardCompleted.questions.slice(1).every((item) => item.correct === true)).toBe(true);
  });
});
