import type { ArcadeRound } from "@prisma/client";
import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendSchoolAudit } from "./audit";
import { ARCADE_GAMES, createArcadeQuestions, initialDifficulty, nextDifficulty, schoolDay, learningStreak, type ArcadeGame, type ArcadeQuestion } from "./arcade-content";
import { allowedAgeBandsForStandard, arcadeGame, recommendedAgeBand, standardBandFromClassLevel, type ArcadeAgeBand } from "./arcade-catalog";
import { effectiveArcadeCatalog } from "./arcade-settings";
import { arcadeLeaderboard, type ArcadeLeaderboardPeriod, type ArcadeLeaderboardScope } from "./arcade-leaderboard";

type Context = { schoolId: string; guardianId: string; userId: string };
type RoundMeta = {
  ageBand: string | null;
  standardBand: string | null;
  engine: string;
  roundLength: number;
  score: number;
  challengeMode: boolean;
  settingsSnapshot: unknown;
};
type RoundRow = ArcadeRound & RoundMeta;
type Child = { id: string; name: string; classId: string | null; class: { name: string; level: string | null } | null };

async function requireCurrentGuardian(tx: TenantDb, context: Context) {
  const guardian = await tx.guardian.findFirst({ where: { id: context.guardianId, schoolId: context.schoolId, userId: context.userId }, select: { id: true } });
  if (!guardian) throw new ForbiddenError("This guardian account is no longer linked.");
}
async function childFor(tx: TenantDb, context: Context, studentId: string): Promise<Child> {
  await requireCurrentGuardian(tx, context);
  const child = await tx.student.findFirst({ where: { schoolId: context.schoolId, id: studentId, status: "active", guardians: { some: { guardianId: context.guardianId, schoolId: context.schoolId } } }, select: { id: true, name: true, classId: true, class: { select: { name: true, level: true } } } });
  if (!child) throw new ForbiddenError("Choose an active child linked to your guardian account.");
  return child;
}
async function lockChild(tx: TenantDb, schoolId: string, studentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"arcade:" + schoolId + ":" + studentId}))`;
}
async function roundRow(tx: TenantDb, schoolId: string, roundId: string) {
  const rows = await tx.$queryRaw<RoundRow[]>`
    SELECT "id","schoolId","studentId","game","difficulty","questions","answers","status","correct","xp","stars","startedAt","completedAt","localDate",
      "ageBand","standardBand","engine","roundLength","score","challengeMode","settingsSnapshot"
    FROM "ArcadeRound" WHERE "id"=${roundId} AND "schoolId"=${schoolId} LIMIT 1
  `;
  return rows[0] ?? null;
}
function publicRound(round: RoundRow | ArcadeRound) {
  const complete = round.status === "completed";
  const questions = round.questions as unknown as ArcadeQuestion[];
  const meta = round as ArcadeRound & Partial<RoundMeta>;
  return {
    id: round.id, studentId: round.studentId, game: round.game, difficulty: round.difficulty, status: round.status,
    answers: round.answers as string[], correct: complete ? round.correct : null, xp: round.xp, stars: round.stars,
    ageBand: meta.ageBand ?? null, standardBand: meta.standardBand ?? null, engine: meta.engine ?? "choice_quiz",
    roundLength: meta.roundLength ?? questions.length, score: complete ? (meta.score ?? 0) : null, challengeMode: meta.challengeMode ?? false,
    questions: questions.map((question) => ({ id: question.id, prompt: question.prompt, options: question.options, ...(complete ? { answer: question.answer, explanation: question.explanation } : {}) })),
  };
}
function publicCatalog(catalog: Awaited<ReturnType<typeof effectiveArcadeCatalog>>, standardBand: ReturnType<typeof standardBandFromClassLevel>, allowedAges: ArcadeAgeBand[]) {
  return catalog.map((item) => ({
    gameKey: item.gameKey, name: item.name, category: item.category, subject: item.subject, description: item.description, symbol: item.symbol, engine: item.engine,
    ageBands: item.effectiveAgeBands, standardBands: item.effectiveStandardBands, difficultyMin: item.difficultyMin, difficultyMax: item.difficultyMax,
    roundLengths: item.roundLengths, defaultRoundLength: item.effectiveRoundLength, timerPolicy: item.timerPolicy, timedChallengesEnabled: item.timedChallengesEnabled,
    live: item.live, enabled: item.enabled, eligible: item.enabled && item.effectiveStandardBands.includes(standardBand) && item.effectiveAgeBands.some((age) => allowedAges.includes(age)),
    dailyGuidanceRounds: item.dailyGuidanceRounds, curriculumTags: item.curriculumTags,
  }));
}
export async function arcadeOverview(tx: TenantDb, context: Context, studentId?: string) {
  await requireCurrentGuardian(tx, context);
  const children = await tx.student.findMany({ where: { schoolId: context.schoolId, status: "active", guardians: { some: { guardianId: context.guardianId, schoolId: context.schoolId } } }, select: { id: true, name: true, classId: true, class: { select: { name: true, level: true } } }, orderBy: { name: "asc" } });
  const selected = studentId ? children.find((child) => child.id === studentId) : children[0];
  if (studentId && !selected) throw new ForbiddenError("This child is not linked to your account.");
  const catalog = await effectiveArcadeCatalog(tx, context.schoolId);
  if (!selected) return { children, selected: null, progress: [], recent: [], streak: 0, catalog: [], standardBand: null, recommendedAgeBand: null, allowedAgeBands: [] };
  const standardBand = standardBandFromClassLevel(selected.class?.level ?? null);
  const allowedAgeBands = allowedAgeBandsForStandard(standardBand);
  const [totals, recent, dates, settings] = await Promise.all([
    tx.$queryRaw<Array<{ game: string; rounds: number; xp: number; correct: number; questions: number; maxStars: number }>>`
      SELECT "game",COUNT(*)::int AS "rounds",COALESCE(SUM("xp"),0)::int AS "xp",COALESCE(SUM("correct"),0)::int AS "correct",COALESCE(SUM("roundLength"),0)::int AS "questions",COALESCE(MAX("stars"),0)::int AS "maxStars"
      FROM "ArcadeRound" WHERE "schoolId"=${context.schoolId} AND "studentId"=${selected.id} AND "status"='completed' GROUP BY "game"
    `,
    tx.$queryRaw<Array<{ id: string; game: string; difficulty: number; correct: number; stars: number; xp: number; score: number; roundLength: number; completedAt: Date | null }>>`
      SELECT "id","game","difficulty","correct","stars","xp","score","roundLength","completedAt" FROM "ArcadeRound"
      WHERE "schoolId"=${context.schoolId} AND "studentId"=${selected.id} AND "status"='completed' ORDER BY "completedAt" DESC LIMIT 10
    `,
    tx.arcadeRound.findMany({ where: { schoolId: context.schoolId, studentId: selected.id, status: "completed" }, select: { localDate: true }, distinct: ["localDate"] }),
    tx.schoolSettings.findUnique({ where: { schoolId: context.schoolId }, select: { timezone: true } }),
  ]);
  const progress = catalog.filter((item) => item.live).map((item) => {
    const total = totals.find((row) => row.game === item.gameKey), rounds = total?.rounds ?? 0, xp = total?.xp ?? 0;
    return { game: item.gameKey, rounds, xp, level: 1 + Math.floor(xp / 100), accuracy: total?.questions ? Math.round((total.correct / total.questions) * 100) : null,
      badges: [rounds ? "First steps" : "", total?.maxStars === 3 ? "Perfect round" : "", xp >= 100 ? "Learning explorer" : ""].filter(Boolean) };
  });
  return {
    children, selected, progress, recent,
    streak: learningStreak(dates.flatMap((date) => date.localDate ? [date.localDate] : []), schoolDay(new Date(), settings?.timezone ?? "Africa/Accra")),
    catalog: publicCatalog(catalog, standardBand, allowedAgeBands), standardBand, recommendedAgeBand: recommendedAgeBand(standardBand), allowedAgeBands,
  };
}
export async function startArcadeRound(tx: TenantDb, context: Context, input: { studentId: string; game: string; ageBand?: ArcadeAgeBand; easier?: boolean; roundLength?: number; challengeMode?: boolean }) {
  const child = await childFor(tx, context, input.studentId);
  const definition = arcadeGame(input.game);
  if (!definition) throw new AppError("Choose an available game.", 400, "INVALID_GAME");
  const catalog = await effectiveArcadeCatalog(tx, context.schoolId);
  const effective = catalog.find((item) => item.gameKey === input.game)!;
  if (!effective.live || !effective.enabled) throw new AppError("This game is not available for play yet.", 409, "GAME_NOT_AVAILABLE");
  const standardBand = standardBandFromClassLevel(child.class?.level ?? null);
  if (!effective.effectiveStandardBands.includes(standardBand)) throw new AppError("This game is not enabled for the learner's school standard.", 400, "GAME_STANDARD_MISMATCH");
  const permittedAgeBands = allowedAgeBandsForStandard(standardBand).filter((age) => effective.effectiveAgeBands.includes(age));
  const ageBand = input.ageBand ?? recommendedAgeBand(standardBand);
  if (!permittedAgeBands.includes(ageBand)) throw new AppError("Choose an age band suitable for this learner's school standard.", 400, "AGE_BAND_NOT_ALLOWED");
  const roundLength = input.roundLength ?? effective.effectiveRoundLength;
  if (!effective.roundLengths.includes(roundLength)) throw new AppError("Choose one of this game's supported round lengths.", 400, "ROUND_LENGTH_NOT_ALLOWED");
  const challengeMode = Boolean(input.challengeMode && effective.timedChallengesEnabled);
  if (!ARCADE_GAMES.includes(input.game as ArcadeGame)) throw new AppError("This game's learning pack is still being prepared.", 409, "GAME_CONTENT_NOT_READY");

  await lockChild(tx, context.schoolId, child.id);
  const activeRows = await tx.$queryRaw<RoundRow[]>`
    SELECT "id","schoolId","studentId","game","difficulty","questions","answers","status","correct","xp","stars","startedAt","completedAt","localDate","ageBand","standardBand","engine","roundLength","score","challengeMode","settingsSnapshot"
    FROM "ArcadeRound" WHERE "schoolId"=${context.schoolId} AND "studentId"=${child.id} AND "game"=${input.game} AND "status"='in_progress' LIMIT 1
  `;
  if (activeRows[0]) return publicRound(activeRows[0]);
  const recent = await tx.arcadeRound.findMany({ where: { schoolId: context.schoolId, studentId: child.id, game: input.game, status: "completed" }, select: { difficulty: true, correct: true }, orderBy: { completedAt: "desc" }, take: 3 });
  const suggested = nextDifficulty(initialDifficulty(child.class?.level ?? null), recent);
  const difficulty = Math.max(effective.difficultyMin, Math.min(effective.difficultyMax, input.easier ? Math.max(1, suggested - 1) : suggested));
  const questions = createArcadeQuestions(input.game as ArcadeGame, difficulty);
  if (questions.length !== roundLength) {
    if (roundLength !== 5) throw new AppError("This learning pack currently supports five-question rounds while the larger game engine is being expanded.", 409, "ROUND_LENGTH_CONTENT_PENDING");
  }
  const id = createId();
  const snapshot = { version: 1, gameKey: input.game, ageBand, standardBand, engine: effective.engine, roundLength: questions.length, challengeMode, timerPolicy: effective.timerPolicy };
  await tx.$executeRaw`
    INSERT INTO "ArcadeRound" ("id","schoolId","studentId","game","difficulty","questions","answers","ageBand","standardBand","engine","roundLength","challengeMode","settingsSnapshot")
    VALUES (${id},${context.schoolId},${child.id},${input.game},${difficulty},${JSON.stringify(questions)}::jsonb,${JSON.stringify(questions.map(() => ""))}::jsonb,${ageBand},${standardBand},${effective.engine},${questions.length},${challengeMode},${JSON.stringify(snapshot)}::jsonb)
  `;
  const created = await roundRow(tx, context.schoolId, id);
  if (!created) throw new AppError("The practice round could not be created.", 500, "ARCADE_CREATE_FAILED");
  return publicRound(created);
}
export async function readArcadeRound(tx: TenantDb, context: Context, roundId: string) {
  const round = await roundRow(tx, context.schoolId, roundId);
  if (!round) throw new AppError("Practice round not found.", 404, "NOT_FOUND");
  await childFor(tx, context, round.studentId);
  return publicRound(round);
}
export async function saveArcadeRound(tx: TenantDb, context: Context, input: { roundId: string; answers: string[]; finish: boolean }) {
  const found = await roundRow(tx, context.schoolId, input.roundId);
  if (!found) throw new AppError("Practice round not found.", 404, "NOT_FOUND");
  await childFor(tx, context, found.studentId);
  await lockChild(tx, context.schoolId, found.studentId);
  const round = await roundRow(tx, context.schoolId, input.roundId);
  if (!round) throw new AppError("Practice round not found.", 404, "NOT_FOUND");
  if (round.status === "completed") return publicRound(round);
  const questions = round.questions as unknown as ArcadeQuestion[];
  if (input.answers.length !== questions.length || input.answers.some((answer, index) => answer !== "" && !questions[index].options.includes(answer))) throw new AppError("Choose one of the displayed answers for each question.", 400, "INVALID_ANSWERS");
  if (input.finish && input.answers.some((answer) => !answer)) throw new AppError(`Answer all ${questions.length} questions before finishing, or save and return later.`, 400, "INCOMPLETE_ROUND");
  if (!input.finish) {
    await tx.$executeRaw`UPDATE "ArcadeRound" SET "answers"=${JSON.stringify(input.answers)}::jsonb WHERE "id"=${round.id} AND "schoolId"=${context.schoolId} AND "status"='in_progress'`;
    return publicRound((await roundRow(tx, context.schoolId, round.id))!);
  }
  const correct = questions.filter((question, index) => question.answer === input.answers[index]).length;
  const accuracy = questions.length ? correct / questions.length : 0;
  const xp = correct * 10;
  const stars = accuracy === 1 ? 3 : accuracy >= 0.6 ? 2 : accuracy >= 0.2 ? 1 : 0;
  const score = Math.round(accuracy * 10000) + round.difficulty * 100;
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: context.schoolId }, select: { timezone: true } });
  const now = new Date(), localDate = schoolDay(now, settings?.timezone ?? "Africa/Accra");
  await tx.$executeRaw`
    UPDATE "ArcadeRound" SET "answers"=${JSON.stringify(input.answers)}::jsonb,"status"='completed',"correct"=${correct},"xp"=${xp},"stars"=${stars},"score"=${score},"completedAt"=${now},"localDate"=${localDate}
    WHERE "id"=${round.id} AND "schoolId"=${context.schoolId} AND "status"='in_progress'
  `;
  const completed = await roundRow(tx, context.schoolId, round.id);
  if (!completed) throw new AppError("The completed round could not be loaded.", 500, "ARCADE_COMPLETE_FAILED");
  await appendSchoolAudit(tx, { schoolId: context.schoolId, actorId: context.userId, action: "arcade.round_completed", entityType: "ArcadeRound", entityId: round.id, after: { studentId: round.studentId, game: round.game, correct, xp, score, ageBand: round.ageBand, standardBand: round.standardBand } });
  return publicRound(completed);
}
export async function guardianArcadeLeaderboard(tx: TenantDb, context: Context, input: { studentId: string; game: string; scope: ArcadeLeaderboardScope; period: ArcadeLeaderboardPeriod; ageBand?: ArcadeAgeBand }) {
  const child = await childFor(tx, context, input.studentId);
  if (!arcadeGame(input.game)) throw new AppError("Choose a game to view its leaderboard.", 400, "INVALID_GAME");
  const standardBand = standardBandFromClassLevel(child.class?.level ?? null);
  const ageBand = input.ageBand ?? recommendedAgeBand(standardBand);
  if (!allowedAgeBandsForStandard(standardBand).includes(ageBand)) throw new AppError("Choose an age band suitable for this learner.", 400, "AGE_BAND_NOT_ALLOWED");
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: context.schoolId }, select: { timezone: true } });
  const rows = await arcadeLeaderboard(tx, { schoolId: context.schoolId, gameKey: input.game, scope: input.scope, period: input.period, timezone: settings?.timezone ?? "Africa/Accra", classId: child.classId, standardBand, ageBand });
  return { game: input.game, scope: input.scope, period: input.period, standardBand, ageBand, rows };
}
