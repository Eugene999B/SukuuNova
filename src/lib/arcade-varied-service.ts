import type { TenantDb } from "./db";
import { startArcadeRound, readArcadeRound } from "./arcade-service";
import { canGenerateArcadeContent, createArcadeGameQuestions, type ArcadeQuestion } from "./arcade-content";
import { canGenerateArcadeInteractionContent, createArcadeInteractionQuestions, type ArcadeInteractionQuestion } from "./arcade-interaction-content";
import { canGenerateArcadeResponseContent, createArcadeResponseQuestions, type ArcadeResponseQuestion } from "./arcade-response-content";
import { canGenerateArcadeWorldContent, createArcadeWorldQuestions, type ArcadeWorldQuestion } from "./arcade-world-content";
import { arcadeQuestionHistorySignatures, buildVariedArcadeQuestionSet, presentArcadeQuestionForAge, type ArcadeVariationAgeBand } from "./arcade-variation";
import { buildAdaptiveLearningPlan, publicAdaptiveLearningPlan, type AdaptiveHistoryRound } from "./adaptive-learning-director";
import { createTurboTypeQuestions, turboTypeWeakKeysFromSnapshots } from "./turbo-type-content";
import { createReadingQuestQuestions } from "./reading-quest-content";
import { createCodeBotsQuestions } from "./codebots-content";
import { createGeoQuestQuestions } from "./geoquest-content";
import { createCediCityMarketQuestions } from "./cedi-city-market-content";
import type { ArcadeAgeBand } from "./arcade-catalog";

type Context = { schoolId: string; guardianId: string; userId: string };
type StartInput = { studentId: string; game: string; ageBand?: ArcadeAgeBand; easier?: boolean; roundLength?: number; challengeMode?: boolean };
type StoredQuestion = ArcadeQuestion | ArcadeInteractionQuestion | ArcadeResponseQuestion | ArcadeWorldQuestion;
type SnapshotRow = { settingsSnapshot: unknown };
type HistoryRow = AdaptiveHistoryRound & { questions: unknown; settingsSnapshot: unknown; completedRoundCount: number };

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function generate(game: string, difficulty: number, length: number, weakKeys: readonly string[] = []): StoredQuestion[] {
  if (game === "keyboard-ninja") return createTurboTypeQuestions(difficulty, length, weakKeys);
  if (game === "comprehension-quest") return createReadingQuestQuestions(difficulty, length);
  if (game === "coding-sequence") return createCodeBotsQuestions(difficulty, length);
  if (game === "ghana-map-master") return createGeoQuestQuestions(difficulty, length);
  if (game === "money-math-market") return createCediCityMarketQuestions(difficulty, length);
  if (canGenerateArcadeContent(game)) return createArcadeGameQuestions(game, difficulty, length);
  if (canGenerateArcadeInteractionContent(game)) return createArcadeInteractionQuestions(game, difficulty, length);
  if (canGenerateArcadeResponseContent(game)) return createArcadeResponseQuestions(game, difficulty, length);
  if (canGenerateArcadeWorldContent(game)) return createArcadeWorldQuestions(game, difficulty, length);
  return [];
}

export async function startVariedArcadeRound(tx: TenantDb, context: Context, input: StartInput) {
  const round = await startArcadeRound(tx, context, input);
  const snapshotRows = await tx.$queryRaw<SnapshotRow[]>`
    SELECT "settingsSnapshot" FROM "ArcadeRound"
    WHERE "schoolId"=${context.schoolId} AND "id"=${round.id} LIMIT 1
  `;
  const snapshot = object(snapshotRows[0]?.settingsSnapshot);
  const savedPlan = publicAdaptiveLearningPlan(snapshot.learningPlan);
  if (round.status !== "in_progress" || round.answers.some((answer) => answer.trim().length > 0)) return { ...round, learningPlan: savedPlan };
  if (snapshot.variationVersion === 3 && snapshot.directorVersion === 1) return { ...round, learningPlan: savedPlan };

  const history = await tx.$queryRaw<HistoryRow[]>`
    SELECT "questions","difficulty","correct","roundLength","settingsSnapshot",COUNT(*) OVER()::int AS "completedRoundCount" FROM "ArcadeRound"
    WHERE "schoolId"=${context.schoolId}
      AND "studentId"=${round.studentId}
      AND "game"=${round.game}
      AND "status"='completed'
      AND "id"<>${round.id}
      AND "ageBand" IS NOT DISTINCT FROM ${round.ageBand}
    ORDER BY "completedAt" DESC
    LIMIT 6
  `;
  const recentSignatures = arcadeQuestionHistorySignatures(history);
  const weakKeys = round.game === "keyboard-ninja" ? turboTypeWeakKeysFromSnapshots(history.map((item) => item.settingsSnapshot)) : [];
  const ageBand = (round.ageBand || "age_6_8") as ArcadeVariationAgeBand;
  const learningPlan = buildAdaptiveLearningPlan({
    game: round.game,
    ageBand,
    suggestedDifficulty: round.difficulty,
    completedRounds: history,
    completedRoundCount: history[0]?.completedRoundCount ?? 0,
    missionId: round.id,
    challengeMode: round.challengeMode,
  });
  let generationAttempt = 0;
  const generator = () => {
    const sequence = learningPlan.generationDifficulties;
    const candidateDifficulty = sequence[generationAttempt % sequence.length] ?? learningPlan.targetDifficulty;
    generationAttempt += 1;
    return generate(round.game, candidateDifficulty, round.roundLength, weakKeys);
  };

  const varied = buildVariedArcadeQuestionSet(generator, round.roundLength, recentSignatures, 12);
  const presented = varied.questions.map((question, index) => presentArcadeQuestionForAge(question, ageBand, round.id, index));
  const nextSnapshot = {
    ...snapshot,
    variationVersion: 3,
    directorVersion: 1,
    learningPlan,
    ...(round.game === "keyboard-ninja" ? { typingFocusKeys: weakKeys } : {}),
    recentRoundWindow: history.length,
    freshQuestionCount: varied.freshCount,
    reusedQuestionCount: varied.reusedCount,
    uniqueConceptCount: varied.uniqueConceptCount,
    originalSuggestedDifficulty: round.difficulty,
    ageAdjustedDifficulty: learningPlan.targetDifficulty,
    presentation: round.game === "keyboard-ninja" ? "turbotype_v1" : round.game === "comprehension-quest" ? "reading_quest_v1" : round.game === "coding-sequence" ? "codebots_v1" : round.game === "ghana-map-master" ? "geoquest_v1" : round.game === "money-math-market" ? "cedi_city_market_v1" : "adaptive_director_v1",
  };

  await tx.$executeRaw`
    UPDATE "ArcadeRound"
    SET "questions"=${JSON.stringify(presented)}::jsonb,
        "answers"=${JSON.stringify(presented.map(() => ""))}::jsonb,
        "difficulty"=${learningPlan.targetDifficulty},
        "roundLength"=${presented.length},
        "settingsSnapshot"=${JSON.stringify(nextSnapshot)}::jsonb
    WHERE "schoolId"=${context.schoolId} AND "id"=${round.id} AND "status"='in_progress'
  `;

  const publicRound = await readArcadeRound(tx, context, round.id);
  return { ...publicRound, learningPlan: publicAdaptiveLearningPlan(learningPlan) };
}
