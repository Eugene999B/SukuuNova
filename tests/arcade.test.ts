import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture, rawDb } from "./helpers";
import { arcadeOverview, startArcadeRound, readArcadeRound, saveArcadeRound } from "../src/lib/arcade-service";
import { ARCADE_GAMES, createArcadeQuestions, initialDifficulty, nextDifficulty, learningStreak, schoolDay, type ArcadeQuestion } from "../src/lib/arcade-content";

async function setup() {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async tx => {
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Arcade class", level: "Primary 1" } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Arcade guardian", userId: fixture.memberId } });
    const students = [];
    for (let i = 0; i < 3; i++) {
      const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name: "Learner "+i, admissionNo: "arcade"+i } });
      if (i < 2) await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent" } });
      students.push(student.id);
    }
    return { guardianId: guardian.id, students };
  });
  return { ...fixture, ...ids, context: { schoolId: fixture.schoolId, guardianId: ids.guardianId, userId: fixture.memberId } };
}
async function correctAnswers(schoolId: string, id: string) {
  return withTenant(schoolId, async tx => (await tx.arcadeRound.findFirstOrThrow({ where: { id } })).questions as unknown as ArcadeQuestion[]).then(questions => questions.map(question => question.answer));
}
describe("Learning Arcade", () => {
  it("creates one resumable round under concurrent starts without exposing answer keys", async () => {
    const f = await setup();
    const rounds = await Promise.all([1,2].map(() => withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "math" }))));
    expect(rounds[0].id).toBe(rounds[1].id);
    expect(rounds[0].difficulty).toBe(1);
    expect(rounds[0].questions).toHaveLength(5);
    expect(rounds[0].questions[0]).not.toHaveProperty("answer");
    expect(rounds[0].questions[0]).not.toHaveProperty("explanation");
  });
  it("persists drafts, completes once under concurrent retries and releases teaching feedback", async () => {
    const f = await setup();
    const round = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "word" }));
    const answers = await correctAnswers(f.schoolId, round.id);
    await withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId: round.id, answers, finish: false }));
    const resumed = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "word" }));
    expect(resumed.answers).toEqual(answers);
    const results = await Promise.all([1,2].map(() => withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId: round.id, answers, finish: true }))));
    expect(results.map(result => result.xp)).toEqual([50,50]);
    expect(results[0].stars).toBe(3);
    expect(results[0].questions[0].explanation).toBeTruthy();
    const summary = await withTenant(f.schoolId, tx => arcadeOverview(tx, f.context, f.students[0]));
    expect(summary.progress.find(item => item.game === "word")).toMatchObject({ xp: 50, rounds: 1, accuracy: 100, badges: ["First steps", "Perfect round"] });
    expect(summary.streak).toBe(1);
    const frozen = await withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId: round.id, answers: ["","","","",""], finish: true }));
    expect(frozen.answers).toEqual(answers);
    expect(await withTenant(f.schoolId, tx => tx.score.count({}))).toBe(0);
  });
  it("isolates siblings, unrelated children, archived learners and reassigned guardian accounts", async () => {
    const f = await setup();
    const round = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "logic" }));
    const sibling = await withTenant(f.schoolId, tx => arcadeOverview(tx, f.context, f.students[1]));
    expect(sibling.recent).toEqual([]);
    expect(sibling.progress.every(item => item.xp === 0)).toBe(true);
    await expect(withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[2], game: "math" }))).rejects.toMatchObject({ status: 403 });
    await expect(withTenant(f.schoolId, tx => arcadeOverview(tx, { ...f.context, userId: f.ownerId }))).rejects.toMatchObject({ status: 403 });
    await withTenant(f.schoolId, tx => tx.student.update({ where: { id: f.students[0] }, data: { status: "inactive" } }));
    await expect(withTenant(f.schoolId, tx => readArcadeRound(tx, f.context, round.id))).rejects.toMatchObject({ status: 403 });
  });
  it("enforces RLS on raw queries and denies a different school", async () => {
    const f = await setup(), other = await setup();
    const round = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "math" }));
    const rows = await withTenant(other.schoolId, tx => tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ArcadeRound" WHERE "id"=${round.id}`);
    expect(rows).toEqual([]);
    await expect(withTenant(other.schoolId, tx => readArcadeRound(tx, other.context, round.id))).rejects.toMatchObject({ status: 404 });
    const policies = await rawDb.$queryRaw<Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>>`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname='ArcadeRound'`;
    expect(policies[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    await expect(withTenant(other.schoolId, tx => tx.arcadeRound.create({ data: { schoolId: other.schoolId, studentId: f.students[0], game: "math", difficulty: 1, questions: createArcadeQuestions("math",1) } }))).rejects.toThrow();
  });
  it("rejects incomplete or forged answers without awarding XP", async () => {
    const f = await setup();
    const round = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "math" }));
    await expect(withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId: round.id, answers: ["","","","",""], finish: true }))).rejects.toMatchObject({ code: "INCOMPLETE_ROUND" });
    await expect(withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId: round.id, answers: ["forged","","","",""], finish: false }))).rejects.toMatchObject({ code: "INVALID_ANSWERS" });
    const read = await withTenant(f.schoolId, tx => readArcadeRound(tx, f.context, round.id));
    expect(read.xp).toBe(0);expect(read.status).toBe("in_progress");
  });
  it("advances after sustained success and supports easier practice", async () => {
    const f = await setup();
    for(let i=0;i<3;i++){
      const round = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "math" }));
      const answers = await correctAnswers(f.schoolId, round.id);
      await withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId: round.id, answers, finish: true }));
    }
    const next = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "math" }));
    expect(next.difficulty).toBe(2);
    await withTenant(f.schoolId, tx => tx.class.updateMany({ where: { schoolId: f.schoolId }, data: { level: "Primary 6" } }));
    const easier = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[1], game: "word", easier: true }));
    expect(easier.difficulty).toBe(1);
    expect(initialDifficulty("JHS 2")).toBe(3);
    expect(initialDifficulty("SHS 1")).toBe(4);
    expect(nextDifficulty(2,[{difficulty:2,correct:0},{difficulty:2,correct:1}])).toBe(1);
  });
  it("generates valid content in every game and difficulty", () => {
    for(const game of ARCADE_GAMES)for(const difficulty of [1,2,3,4]){
      const questions = createArcadeQuestions(game,difficulty);
      expect(questions).toHaveLength(5);
      for(const question of questions){
        expect(question.options.filter(option=>option===question.answer)).toHaveLength(1);
        expect(new Set(question.options).size).toBe(question.options.length);
        expect(question.explanation.length).toBeGreaterThan(5);
      }
    }
  });
  it("calculates learning days across timezone boundaries and tolerates a rest day", () => {
    expect(schoolDay(new Date("2026-09-09T00:30:00Z"),"America/Los_Angeles")).toBe("2026-09-08");
    expect(learningStreak(["2026-09-08","2026-09-08","2026-09-07"],"2026-09-09")).toBe(2);
    expect(learningStreak(["2026-09-07"],"2026-09-09")).toBe(0);
  });
});
