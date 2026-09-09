import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture, rawDb } from "./helpers";
import { arcadeOverview, guardianArcadeLeaderboard, startArcadeRound, readArcadeRound, saveArcadeRound } from "../src/lib/arcade-service";
import { ARCADE_GAMES, createArcadeQuestions, initialDifficulty, nextDifficulty, learningStreak, schoolDay, type ArcadeQuestion } from "../src/lib/arcade-content";
import { ARCADE_GAME_CATALOG, allowedAgeBandsForStandard, recommendedAgeBand, standardBandFromClassLevel } from "../src/lib/arcade-catalog";
import { effectiveArcadeCatalog } from "../src/lib/arcade-settings";
import { arcadeLeaderboardStartDate, leaderboardDisplayName } from "../src/lib/arcade-leaderboard";

async function setup() {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async tx => {
    const classroom = await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Arcade class", level: "Primary 1" } });
    const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Arcade guardian", userId: fixture.memberId } });
    const names = ["Ama Mensah", "Kojo Boateng", "Unlinked Learner"];
    const students = [];
    for (let i = 0; i < 3; i++) {
      const student = await tx.student.create({ data: { schoolId: fixture.schoolId, classId: classroom.id, name: names[i], admissionNo: "arcade"+i } });
      if (i < 2) await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent" } });
      students.push(student.id);
    }
    return { guardianId: guardian.id, students, classId: classroom.id };
  });
  return { ...fixture, ...ids, context: { schoolId: fixture.schoolId, guardianId: ids.guardianId, userId: fixture.memberId } };
}
async function correctAnswers(schoolId: string, id: string) {
  return withTenant(schoolId, async tx => (await tx.arcadeRound.findFirstOrThrow({ where: { id } })).questions as unknown as ArcadeQuestion[]).then(questions => questions.map(question => question.answer));
}
describe("Learning Arcade", () => {
  it("ships a 64-game registry while preserving the three verified live game keys", () => {
    expect(ARCADE_GAME_CATALOG).toHaveLength(64);
    expect(new Set(ARCADE_GAME_CATALOG.map(game => game.gameKey)).size).toBe(64);
    expect(ARCADE_GAME_CATALOG.filter(game => game.live).map(game => game.gameKey)).toEqual(["math","word","logic"]);
    expect(ARCADE_GAME_CATALOG.every(game => game.ageBands.length > 0 && game.standardBands.length > 0 && game.roundLengths.includes(game.defaultRoundLength))).toBe(true);
  });
  it("maps school standards to recommended age bands without promoting learners into older content", () => {
    expect(standardBandFromClassLevel("KG 2")).toBe("kg");
    expect(standardBandFromClassLevel("Primary 5")).toBe("basic_4_6");
    expect(standardBandFromClassLevel("JHS 2")).toBe("jhs");
    expect(standardBandFromClassLevel("SHS 1")).toBe("shs");
    expect(recommendedAgeBand("basic_4_6")).toBe("age_9_11");
    expect(allowedAgeBandsForStandard("basic_1_3")).toEqual(["age_4_5","age_6_8"]);
    expect(allowedAgeBandsForStandard("basic_1_3")).not.toContain("age_12_14");
  });
  it("creates one resumable round under concurrent starts without exposing answer keys", async () => {
    const f = await setup();
    const rounds = await Promise.all([1,2].map(() => withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "math" }))));
    expect(rounds[0].id).toBe(rounds[1].id);
    expect(rounds[0].difficulty).toBe(1);
    expect(rounds[0].roundLength).toBe(5);
    expect(rounds[0].ageBand).toBe("age_6_8");
    expect(rounds[0].standardBand).toBe("basic_1_3");
    expect(rounds[0].questions).toHaveLength(5);
    expect(rounds[0].questions[0]).not.toHaveProperty("answer");
    expect(rounds[0].questions[0]).not.toHaveProperty("explanation");
  });
  it("blocks older age bands, planned content and school-disabled games", async () => {
    const f = await setup();
    await expect(withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "math", ageBand: "age_12_14" }))).rejects.toMatchObject({ code: "AGE_BAND_NOT_ALLOWED" });
    await expect(withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "times-table-turbo" }))).rejects.toMatchObject({ code: "GAME_NOT_AVAILABLE" });
    await withTenant(f.schoolId, tx => tx.$executeRaw`INSERT INTO "ArcadeGameSetting" ("id","schoolId","gameKey","enabled") VALUES (${createId()},${f.schoolId},'math',FALSE)`);
    const catalog = await withTenant(f.schoolId, tx => effectiveArcadeCatalog(tx, f.schoolId));
    expect(catalog.find(game => game.gameKey === "math")?.enabled).toBe(false);
    await expect(withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "math" }))).rejects.toMatchObject({ code: "GAME_NOT_AVAILABLE" });
  });
  it("persists drafts, completes once under concurrent retries and snapshots leaderboard score context", async () => {
    const f = await setup();
    const round = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "word", ageBand: "age_6_8" }));
    const answers = await correctAnswers(f.schoolId, round.id);
    await withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId: round.id, answers, finish: false }));
    const resumed = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "word" }));
    expect(resumed.answers).toEqual(answers);
    const results = await Promise.all([1,2].map(() => withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId: round.id, answers, finish: true }))));
    expect(results.map(result => result.xp)).toEqual([50,50]);
    expect(results[0].stars).toBe(3);
    expect(results[0].score).toBe(10100);
    expect(results[0].questions[0].explanation).toBeTruthy();
    const snapshot = await withTenant(f.schoolId, tx => tx.$queryRaw<Array<{ ageBand:string|null;standardBand:string|null;engine:string;roundLength:number;score:number;settingsSnapshot:unknown }>>`SELECT "ageBand","standardBand","engine","roundLength","score","settingsSnapshot" FROM "ArcadeRound" WHERE "id"=${round.id}`);
    expect(snapshot[0]).toMatchObject({ ageBand:"age_6_8", standardBand:"basic_1_3", engine:"choice_quiz", roundLength:5, score:10100 });
    expect(snapshot[0].settingsSnapshot).toMatchObject({ version:1, gameKey:"word", ageBand:"age_6_8", standardBand:"basic_1_3" });
    const summary = await withTenant(f.schoolId, tx => arcadeOverview(tx, f.context, f.students[0]));
    expect(summary.catalog).toHaveLength(64);
    expect(summary.standardBand).toBe("basic_1_3");
    expect(summary.recommendedAgeBand).toBe("age_6_8");
    expect(summary.progress.find(item => item.game === "word")).toMatchObject({ xp: 50, rounds: 1, accuracy: 100, badges: ["First steps", "Perfect round"] });
    expect(summary.streak).toBe(1);
    const frozen = await withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId: round.id, answers: ["","","","",""], finish: true }));
    expect(frozen.answers).toEqual(answers);
    expect(await withTenant(f.schoolId, tx => tx.score.count({}))).toBe(0);
  });
  it("ranks learners per game with privacy-safe names and school/age/standard scope", async () => {
    const f = await setup();
    const first = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId:f.students[0], game:"math" }));
    const firstAnswers = await correctAnswers(f.schoolId, first.id);
    await withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId:first.id, answers:firstAnswers, finish:true }));
    const second = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId:f.students[1], game:"math" }));
    const questions = await withTenant(f.schoolId, async tx => (await tx.arcadeRound.findFirstOrThrow({where:{id:second.id}})).questions as unknown as ArcadeQuestion[]);
    const secondAnswers = questions.map((question,index)=>index===0?question.options.find(option=>option!==question.answer)!:question.answer);
    await withTenant(f.schoolId, tx => saveArcadeRound(tx, f.context, { roundId:second.id, answers:secondAnswers, finish:true }));
    const board = await withTenant(f.schoolId, tx => guardianArcadeLeaderboard(tx, f.context, {studentId:f.students[0],game:"math",scope:"standard",period:"all"}));
    expect(board.rows).toHaveLength(2);
    expect(board.rows[0]).toMatchObject({studentId:f.students[0],displayName:"Ama M.",rank:1,bestScore:10100});
    expect(board.rows[1]).toMatchObject({studentId:f.students[1],displayName:"Kojo B.",rank:2});
    const ageBoard = await withTenant(f.schoolId, tx => guardianArcadeLeaderboard(tx, f.context, {studentId:f.students[0],game:"math",scope:"age",period:"all",ageBand:"age_6_8"}));
    expect(ageBoard.rows.map(row=>row.studentId)).toEqual([f.students[0],f.students[1]]);
    expect(leaderboardDisplayName("Abena Owusu Mensah")).toBe("Abena M.");
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
  it("enforces RLS on rounds and per-game settings and denies a different school", async () => {
    const f = await setup(), other = await setup();
    const round = await withTenant(f.schoolId, tx => startArcadeRound(tx, f.context, { studentId: f.students[0], game: "math" }));
    const rows = await withTenant(other.schoolId, tx => tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ArcadeRound" WHERE "id"=${round.id}`);
    expect(rows).toEqual([]);
    await withTenant(f.schoolId, tx => tx.$executeRaw`INSERT INTO "ArcadeGameSetting" ("id","schoolId","gameKey","enabled") VALUES (${createId()},${f.schoolId},'logic',TRUE)`);
    const hiddenSettings = await withTenant(other.schoolId, tx => tx.$queryRaw<Array<{gameKey:string}>>`SELECT "gameKey" FROM "ArcadeGameSetting" WHERE "gameKey"='logic'`);
    expect(hiddenSettings).toEqual([]);
    await expect(withTenant(other.schoolId, tx => readArcadeRound(tx, other.context, round.id))).rejects.toMatchObject({ status: 404 });
    const policies = await rawDb.$queryRaw<Array<{ relname:string;relrowsecurity: boolean; relforcerowsecurity: boolean }>>`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('ArcadeRound','ArcadeGameSetting') ORDER BY relname`;
    expect(policies).toEqual([
      {relname:"ArcadeGameSetting",relrowsecurity:true,relforcerowsecurity:true},
      {relname:"ArcadeRound",relrowsecurity:true,relforcerowsecurity:true},
    ]);
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
  it("generates valid content in every live legacy game and difficulty", () => {
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
  it("calculates learning and leaderboard periods across school timezone boundaries", () => {
    expect(schoolDay(new Date("2026-09-09T00:30:00Z"),"America/Los_Angeles")).toBe("2026-09-08");
    expect(learningStreak(["2026-09-08","2026-09-08","2026-09-07"],"2026-09-09")).toBe(2);
    expect(learningStreak(["2026-09-07"],"2026-09-09")).toBe(0);
    expect(arcadeLeaderboardStartDate(new Date("2026-09-09T12:00:00Z"),"Africa/Accra","weekly")).toBe("2026-09-07");
    expect(arcadeLeaderboardStartDate(new Date("2026-09-09T12:00:00Z"),"Africa/Accra","monthly")).toBe("2026-09-01");
    expect(arcadeLeaderboardStartDate(new Date("2026-09-09T12:00:00Z"),"Africa/Accra","all")).toBeNull();
  });
});
