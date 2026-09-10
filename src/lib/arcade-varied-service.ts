import type { TenantDb } from "./db";
import { startArcadeRound, readArcadeRound } from "./arcade-service";
import { canGenerateArcadeContent, createArcadeGameQuestions, type ArcadeQuestion } from "./arcade-content";
import { canGenerateArcadeInteractionContent, createArcadeInteractionQuestions, type ArcadeInteractionQuestion } from "./arcade-interaction-content";
import { canGenerateArcadeResponseContent, createArcadeResponseQuestions, type ArcadeResponseQuestion } from "./arcade-response-content";
import { canGenerateArcadeWorldContent, createArcadeWorldQuestions, type ArcadeWorldQuestion } from "./arcade-world-content";
import { arcadeQuestionHistorySignatures, buildVariedArcadeQuestionSet, presentArcadeQuestionForAge, type ArcadeVariationAgeBand } from "./arcade-variation";
import type { ArcadeAgeBand } from "./arcade-catalog";

type Context = { schoolId: string; guardianId: string; userId: string };
type StartInput = { studentId: string; game: string; ageBand?: ArcadeAgeBand; easier?: boolean; roundLength?: number; challengeMode?: boolean };
type StoredQuestion = ArcadeQuestion | ArcadeInteractionQuestion | ArcadeResponseQuestion | ArcadeWorldQuestion;
type SnapshotRow = { settingsSnapshot: unknown };
type HistoryRow = { questions: unknown };

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function generate(game: string, difficulty: number, length: number): StoredQuestion[] {
  if (canGenerateArcadeContent(game)) return createArcadeGameQuestions(game, difficulty, length);
  if (canGenerateArcadeInteractionContent(game)) return createArcadeInteractionQuestions(game, difficulty, length);
  if (canGenerateArcadeResponseContent(game)) return createArcadeResponseQuestions(game, difficulty, length);
  if (canGenerateArcadeWorldContent(game)) return createArcadeWorldQuestions(game, difficulty, length);
  return [];
}

export async function startVariedArcadeRound(tx: TenantDb, context: Context, input: StartInput) {
  const round = await startArcadeRound(tx, context, input);
  if (round.status !== "in_progress" || round.answers.some((answer) => answer.trim().length > 0)) return round;

  const snapshotRows = await tx.$queryRaw<SnapshotRow[]>`
    SELECT "settingsSnapshot" FROM "ArcadeRound"
    WHERE "schoolId"=${context.schoolId} AND "id"=${round.id} LIMIT 1
  `;
  const snapshot = object(snapshotRows[0]?.settingsSnapshot);
  if (snapshot.variationVersion === 2) return round;

  const history = await tx.$queryRaw<HistoryRow[]>`
    SELECT "questions" FROM "ArcadeRound"
    WHERE "schoolId"=${context.schoolId}
      AND "studentId"=${round.studentId}
      AND "game"=${round.game}
      AND "status"='completed'
      AND "id"<>${round.id}
      AND "ageBand" IS NOT DISTINCT FROM ${round.ageBand}
    ORDER BY "completedAt" DESC
    LIMIT 4
  `;
  const recentSignatures = arcadeQuestionHistorySignatures(history);
  let generationAttempt = 0;
  const generator = () => {
    generationAttempt += 1;
    // Try the current mastery level repeatedly first. If a static bank is exhausted,
    // interleave one-step-easier reinforcement rather than pushing a learner above
    // their age/standard band simply to manufacture novelty.
    const candidateDifficulty = generationAttempt <= 4 || round.difficulty <= 1
      ? round.difficulty
      : Math.max(1, round.difficulty - 1);
    return generate(round.game, candidateDifficulty, round.roundLength);
  };

  const varied = buildVariedArcadeQuestionSet(generator, round.roundLength, recentSignatures, 12);
  const ageBand = (round.ageBand || "age_6_8") as ArcadeVariationAgeBand;
  const presented = varied.questions.map((question, index) => presentArcadeQuestionForAge(question, ageBand, round.id, index));
  const nextSnapshot = {
    ...snapshot,
    variationVersion: 2,
    recentRoundWindow: history.length,
    freshQuestionCount: varied.freshCount,
    reusedQuestionCount: varied.reusedCount,
    uniqueConceptCount: varied.uniqueConceptCount,
    presentation: "age_aware_motion_v1",
  };

  await tx.$executeRaw`
    UPDATE "ArcadeRound"
    SET "questions"=${JSON.stringify(presented)}::jsonb,
        "answers"=${JSON.stringify(presented.map(() => ""))}::jsonb,
        "roundLength"=${presented.length},
        "settingsSnapshot"=${JSON.stringify(nextSnapshot)}::jsonb
    WHERE "schoolId"=${context.schoolId} AND "id"=${round.id} AND "status"='in_progress'
  `;

  return readArcadeRound(tx, context, round.id);
}
