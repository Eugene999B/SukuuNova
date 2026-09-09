import type { ArcadeRound, Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendSchoolAudit } from "./audit";
import { ARCADE_GAMES, createArcadeQuestions, initialDifficulty, nextDifficulty, schoolDay, learningStreak, type ArcadeGame, type ArcadeQuestion } from "./arcade-content";

type Context = { schoolId: string; guardianId: string; userId: string };
async function requireCurrentGuardian(tx: TenantDb, context: Context) {
  const guardian = await tx.guardian.findFirst({ where: { id: context.guardianId, schoolId: context.schoolId, userId: context.userId }, select: { id: true } });
  if (!guardian) throw new ForbiddenError("This guardian account is no longer linked.");
}
async function childFor(tx: TenantDb, context: Context, studentId: string) {
  await requireCurrentGuardian(tx, context);
  const child = await tx.student.findFirst({ where: { schoolId: context.schoolId, id: studentId, status: "active", guardians: { some: { guardianId: context.guardianId, schoolId: context.schoolId } } }, select: { id: true, name: true, class: { select: { name: true, level: true } } } });
  if (!child) throw new ForbiddenError("Choose an active child linked to your guardian account.");
  return child;
}
async function lockChild(tx: TenantDb, schoolId: string, studentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"arcade:" + schoolId + ":" + studentId}))`;
}
function publicRound(round: ArcadeRound) {
  const complete = round.status === "completed";
  const questions = round.questions as unknown as ArcadeQuestion[];
  return { id: round.id, studentId: round.studentId, game: round.game, difficulty: round.difficulty, status: round.status, answers: round.answers as string[],
    correct: complete ? round.correct : null, xp: round.xp, stars: round.stars,
    questions: questions.map(question => ({ id: question.id, prompt: question.prompt, options: question.options, ...(complete ? { answer: question.answer, explanation: question.explanation } : {}) })) };
}
export async function arcadeOverview(tx: TenantDb, context: Context, studentId?: string) {
  await requireCurrentGuardian(tx, context);
  const children = await tx.student.findMany({ where: { schoolId: context.schoolId, status: "active", guardians: { some: { guardianId: context.guardianId, schoolId: context.schoolId } } }, select: { id: true, name: true, class: { select: { name: true, level: true } } }, orderBy: { name: "asc" } });
  const selected = studentId ? children.find(child => child.id === studentId) : children[0];
  if (studentId && !selected) throw new ForbiddenError("This child is not linked to your account.");
  if (!selected) return { children, selected: null, progress: [], recent: [], streak: 0 };
  const where = { schoolId: context.schoolId, studentId: selected.id, status: "completed" };
  const [totals, recent, dates, settings] = await Promise.all([
    tx.arcadeRound.groupBy({ by: ["game"], where, _sum: { xp: true, correct: true }, _count: { _all: true }, _max: { stars: true } }),
    tx.arcadeRound.findMany({ where, select: { id: true, game: true, difficulty: true, correct: true, stars: true, xp: true, completedAt: true }, orderBy: { completedAt: "desc" }, take: 10 }),
    tx.arcadeRound.findMany({ where, select: { localDate: true }, distinct: ["localDate"] }),
    tx.schoolSettings.findUnique({ where: { schoolId: context.schoolId }, select: { timezone: true } })
  ]);
  const progress = ARCADE_GAMES.map(game => {
    const total = totals.find(item => item.game === game), rounds = total?._count._all ?? 0, xp = total?._sum.xp ?? 0;
    return { game, rounds, xp, level: 1 + Math.floor(xp / 100), accuracy: rounds ? Math.round((total?._sum.correct ?? 0) / (rounds * 5) * 100) : null,
      badges: [rounds ? "First steps" : "", total?._max.stars === 3 ? "Perfect round" : "", xp >= 100 ? "Learning explorer" : ""].filter(Boolean) };
  });
  return { children, selected, progress, recent, streak: learningStreak(dates.flatMap(date => date.localDate ? [date.localDate] : []), schoolDay(new Date(), settings?.timezone ?? "Africa/Accra")) };
}
export async function startArcadeRound(tx: TenantDb, context: Context, input: { studentId: string; game: ArcadeGame; easier?: boolean }) {
  const child = await childFor(tx, context, input.studentId);
  if (!ARCADE_GAMES.includes(input.game)) throw new AppError("Choose an available game.", 400, "INVALID_GAME");
  await lockChild(tx, context.schoolId, child.id);
  const where = { schoolId: context.schoolId, studentId: child.id, game: input.game };
  const active = await tx.arcadeRound.findFirst({ where: { ...where, status: "in_progress" } });
  if (active) return publicRound(active);
  const recent = await tx.arcadeRound.findMany({ where: { ...where, status: "completed" }, select: { difficulty: true, correct: true }, orderBy: { completedAt: "desc" }, take: 3 });
  const suggested = nextDifficulty(initialDifficulty(child.class?.level ?? null), recent);
  const difficulty = input.easier ? Math.max(1, suggested - 1) : suggested;
  const questions = createArcadeQuestions(input.game, difficulty);
  const round = await tx.arcadeRound.create({ data: { ...where, difficulty, questions: questions as unknown as Prisma.InputJsonValue, answers: questions.map(() => "") } });
  return publicRound(round);
}
export async function readArcadeRound(tx: TenantDb, context: Context, roundId: string) {
  const round = await tx.arcadeRound.findFirst({ where: { id: roundId, schoolId: context.schoolId } });
  if (!round) throw new AppError("Practice round not found.", 404, "NOT_FOUND");
  await childFor(tx, context, round.studentId);
  return publicRound(round);
}
export async function saveArcadeRound(tx: TenantDb, context: Context, input: { roundId: string; answers: string[]; finish: boolean }) {
  const found = await tx.arcadeRound.findFirst({ where: { id: input.roundId, schoolId: context.schoolId } });
  if (!found) throw new AppError("Practice round not found.", 404, "NOT_FOUND");
  await childFor(tx, context, found.studentId);
  await lockChild(tx, context.schoolId, found.studentId);
  const round = await tx.arcadeRound.findFirstOrThrow({ where: { id: input.roundId, schoolId: context.schoolId } });
  // A network retry returns the stored award, never a second reward or rewritten answers.
  if (round.status === "completed") return publicRound(round);
  const questions = round.questions as unknown as ArcadeQuestion[];
  if (input.answers.length !== questions.length || input.answers.some((answer, index) => answer !== "" && !questions[index].options.includes(answer))) throw new AppError("Choose one of the displayed answers for each question.", 400, "INVALID_ANSWERS");
  if (input.finish && input.answers.some(answer => !answer)) throw new AppError("Answer all five questions before finishing, or save and return later.", 400, "INCOMPLETE_ROUND");
  if (!input.finish) return publicRound(await tx.arcadeRound.update({ where: { id: round.id }, data: { answers: input.answers } }));
  const correct = questions.filter((question, index) => question.answer === input.answers[index]).length;
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: context.schoolId }, select: { timezone: true } });
  const now = new Date();
  const completed = await tx.arcadeRound.update({ where: { id: round.id }, data: { answers: input.answers, status: "completed", correct, xp: correct * 10, stars: correct === 5 ? 3 : correct >= 3 ? 2 : correct >= 1 ? 1 : 0, completedAt: now, localDate: schoolDay(now, settings?.timezone ?? "Africa/Accra") } });
  await appendSchoolAudit(tx, { schoolId: context.schoolId, actorId: context.userId, action: "arcade.round_completed", entityType: "ArcadeRound", entityId: round.id, after: { studentId: round.studentId, game: round.game, correct, xp: completed.xp } });
  return publicRound(completed);
}
