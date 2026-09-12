import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { appendSchoolAudit } from "./audit";
import { schoolDay } from "./arcade-content";

type Context = { schoolId: string; guardianId: string; userId: string };
type StoredQuestion = { id: string; prompt: string; options: string[]; answer: string; explanation: string };
type RoundRow = {
  id: string;
  schoolId: string;
  studentId: string;
  game: string;
  difficulty: number;
  questions: unknown;
  answers: unknown;
  status: string;
  correct: number;
  xp: number;
  stars: number;
  score: number;
};

async function readRound(tx: TenantDb, schoolId: string, roundId: string) {
  const rows = await tx.$queryRaw<RoundRow[]>`
    SELECT "id","schoolId","studentId","game","difficulty","questions","answers","status","correct","xp","stars","score"
    FROM "ArcadeRound"
    WHERE "schoolId"=${schoolId} AND "id"=${roundId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function requireLinkedLearner(tx: TenantDb, context: Context, studentId: string) {
  const linked = await tx.student.findFirst({
    where: {
      id: studentId,
      schoolId: context.schoolId,
      status: "active",
      guardians: { some: { guardianId: context.guardianId, schoolId: context.schoolId } },
    },
    select: { id: true },
  });
  if (!linked) throw new ForbiddenError("This learner is not linked to your guardian account.");
}

function storedQuestions(value: unknown): StoredQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoredQuestion => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    return typeof row.id === "string"
      && typeof row.prompt === "string"
      && Array.isArray(row.options)
      && row.options.every((option) => typeof option === "string")
      && typeof row.answer === "string"
      && typeof row.explanation === "string";
  });
}

function storedAnswers(value: unknown, count: number) {
  const answers = Array.isArray(value) ? value.map((answer) => typeof answer === "string" ? answer : "") : [];
  while (answers.length < count) answers.push("");
  return answers.slice(0, count);
}

export async function lockNovaMillionaireAnswer(
  tx: TenantDb,
  context: Context,
  input: { roundId: string; questionIndex: number; answer: string },
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nova-millionaire:${context.schoolId}:${input.roundId}`}))`;
  const round = await readRound(tx, context.schoolId, input.roundId);
  if (!round) throw new AppError("Nova Millionaire round not found.", 404, "NOT_FOUND");
  await requireLinkedLearner(tx, context, round.studentId);
  if (round.game !== "logic") throw new AppError("This answer lock is only available in Nova Millionaire.", 400, "INVALID_GAME");

  const questions = storedQuestions(round.questions);
  if (questions.length === 0) throw new AppError("This Nova Millionaire round has no playable questions.", 409, "ROUND_NOT_READY");
  if (input.questionIndex < 0 || input.questionIndex >= questions.length) throw new AppError("Choose the active spotlight question.", 400, "INVALID_QUESTION");

  const question = questions[input.questionIndex];
  if (!question.options.includes(input.answer)) throw new AppError("Choose one of the displayed answers.", 400, "INVALID_ANSWER");
  const answers = storedAnswers(round.answers, questions.length);
  const existing = answers[input.questionIndex];
  if (existing && existing !== input.answer) throw new AppError("That spotlight answer is already locked.", 409, "ANSWER_ALREADY_LOCKED");

  const answer = existing || input.answer;
  const correct = answer === question.answer;
  if (!existing && round.status === "in_progress") {
    answers[input.questionIndex] = answer;
    await tx.$executeRaw`
      UPDATE "ArcadeRound"
      SET "answers"=${JSON.stringify(answers)}::jsonb
      WHERE "schoolId"=${context.schoolId} AND "id"=${round.id} AND "status"='in_progress'
    `;
  }

  const lockedCount = answers.filter(Boolean).length;
  let roundComplete = round.status === "completed";
  let final = roundComplete ? { correct: round.correct, xp: round.xp, stars: round.stars, score: round.score } : null;

  if (!roundComplete && lockedCount === questions.length) {
    const correctCount = questions.filter((item, index) => item.answer === answers[index]).length;
    const accuracy = correctCount / questions.length;
    const xp = correctCount * 10;
    const stars = accuracy === 1 ? 3 : accuracy >= .6 ? 2 : accuracy >= .2 ? 1 : 0;
    const score = Math.round(accuracy * 10000) + round.difficulty * 100;
    const settings = await tx.schoolSettings.findUnique({ where: { schoolId: context.schoolId }, select: { timezone: true } });
    const now = new Date();
    const localDate = schoolDay(now, settings?.timezone ?? "Africa/Accra");
    const updated = await tx.$executeRaw`
      UPDATE "ArcadeRound"
      SET "answers"=${JSON.stringify(answers)}::jsonb,
          "status"='completed',
          "correct"=${correctCount},
          "xp"=${xp},
          "stars"=${stars},
          "score"=${score},
          "completedAt"=${now},
          "localDate"=${localDate}
      WHERE "schoolId"=${context.schoolId} AND "id"=${round.id} AND "status"='in_progress'
    `;
    if (updated) {
      await appendSchoolAudit(tx, {
        schoolId: context.schoolId,
        actorId: context.userId,
        action: "arcade.round_completed",
        entityType: "ArcadeRound",
        entityId: round.id,
        after: { studentId: round.studentId, game: round.game, correct: correctCount, xp, score },
      });
    }
    roundComplete = true;
    final = { correct: correctCount, xp, stars, score };
  }

  return {
    roundId: round.id,
    questionIndex: input.questionIndex,
    answer,
    correct,
    explanation: question.explanation,
    lockedCount,
    total: questions.length,
    roundComplete,
    final,
  };
}
