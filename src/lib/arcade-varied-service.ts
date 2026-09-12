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
import { createSignalShieldQuestions } from "./signal-shield-content";
import { createEcoGridQuestions } from "./ecogrid-content";
import { createBioQuestQuestions } from "./bioquest-content";
import { createChronicleVaultQuestions } from "./chronicle-vault-content";
import { createCircuitForgeQuestions } from "./circuit-forge-content";
import { arcadeProgressionDifficulty, arcadeProgressionNodeName, arcadeV5Progression } from "./arcade-v5-design";
import { createArcadeSessionRemix, type ArcadeSessionRemix } from "./arcade-session-remix";
import type { ArcadeAgeBand } from "./arcade-catalog";

type Context = { schoolId: string; guardianId: string; userId: string };
type StartInput = { studentId: string; game: string; ageBand?: ArcadeAgeBand; easier?: boolean; roundLength?: number; challengeMode?: boolean; node?: number; level?: number };
type StoredQuestion = ArcadeQuestion | ArcadeInteractionQuestion | ArcadeResponseQuestion | ArcadeWorldQuestion;
type SnapshotRow = { settingsSnapshot: unknown };
type HistoryRow = AdaptiveHistoryRound & { questions: unknown; settingsSnapshot: unknown; completedRoundCount: number };

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function nodeNumber(value: unknown, max = 20) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}
function storedRemix(value: unknown) {
  const record = object(value);
  return record.version === 1 && typeof record.seedId === "string" && typeof record.mutationKey === "string" ? value as ArcadeSessionRemix : null;
}

function generate(game: string, difficulty: number, length: number, weakKeys: readonly string[] = []): StoredQuestion[] {
  if (game === "keyboard-ninja") return createTurboTypeQuestions(difficulty, length, weakKeys);
  if (game === "comprehension-quest") return createReadingQuestQuestions(difficulty, length);
  if (game === "coding-sequence") return createCodeBotsQuestions(difficulty, length);
  if (game === "ghana-map-master") return createGeoQuestQuestions(difficulty, length);
  if (game === "money-math-market") return createCediCityMarketQuestions(difficulty, length);
  if (game === "cyber-safety") return createSignalShieldQuestions(difficulty, length);
  if (game === "environment-guardian") return createEcoGridQuestions(difficulty, length);
  if (game === "body-explorer") return createBioQuestQuestions(difficulty, length);
  if (game === "history-timeline") return createChronicleVaultQuestions(difficulty, length);
  if (game === "circuit-logic") return createCircuitForgeQuestions(difficulty, length);
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
  const progression = arcadeV5Progression(round.game);
  const requestedNode = nodeNumber(snapshot.progressionNode, progression.nodes.length || 20)
    ?? nodeNumber(snapshot.selectedLevel, progression.nodes.length || 20)
    ?? nodeNumber(input.node, progression.nodes.length || 20)
    ?? nodeNumber(input.level, progression.nodes.length || 20);
  const progressionNode = progression.selectableNodes ? (requestedNode ?? 1) : null;
  const progressionNodeName = arcadeProgressionNodeName(round.game, progressionNode);
  const sessionRemix = storedRemix(snapshot.sessionRemix) ?? createArcadeSessionRemix(round.game, progressionNode);
  const decorated = {
    progressionMode: progression.mode,
    progressionNode,
    progressionNodeName,
    sessionRemix,
    // Compatibility aliases for V4/V5 clients that may still have a round open during rollout.
    selectedLevel: progressionNode,
    levelName: progressionNodeName,
  };
  if (round.status !== "in_progress" || round.answers.some((answer) => answer.trim().length > 0)) return { ...round, learningPlan: savedPlan, ...decorated };
  if (snapshot.variationVersion === 4 && snapshot.directorVersion === 1) return { ...round, learningPlan: savedPlan, ...decorated };

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
  const progressionDifficulty = progressionNode ? arcadeProgressionDifficulty(round.game, progressionNode) : null;
  const learningPlan = buildAdaptiveLearningPlan({
    game: round.game,
    ageBand,
    suggestedDifficulty: progressionDifficulty ?? round.difficulty,
    completedRounds: history,
    completedRoundCount: history[0]?.completedRoundCount ?? 0,
    missionId: `${round.id}:${sessionRemix.mutationKey}`,
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
  const presented = varied.questions.map((question, index) => presentArcadeQuestionForAge(question, ageBand, `${round.id}:${sessionRemix.mutationKey}`, index));
  const nextSnapshot = {
    ...snapshot,
    variationVersion: 4,
    directorVersion: 1,
    learningPlan,
    progressionMode: progression.mode,
    progressionNode,
    progressionNodeName,
    sessionRemix,
    ...(round.game === "keyboard-ninja" ? { typingFocusKeys: weakKeys } : {}),
    ...(progressionNode ? { selectedLevel: progressionNode, levelName: progressionNodeName } : {}),
    recentRoundWindow: history.length,
    freshQuestionCount: varied.freshCount,
    reusedQuestionCount: varied.reusedCount,
    uniqueConceptCount: varied.uniqueConceptCount,
    originalSuggestedDifficulty: round.difficulty,
    progressionRequestedDifficulty: progressionDifficulty,
    levelRequestedDifficulty: progressionDifficulty,
    ageAdjustedDifficulty: learningPlan.targetDifficulty,
    presentation: round.game === "keyboard-ninja" ? "turbotype_v1" : round.game === "comprehension-quest" ? "reading_quest_v1" : round.game === "coding-sequence" ? "codebots_v1" : round.game === "ghana-map-master" ? "geoquest_v1" : round.game === "money-math-market" ? "cedi_city_market_v1" : round.game === "cyber-safety" ? "signal_shield_v1" : round.game === "environment-guardian" ? "ecogrid_ghana_v1" : round.game === "body-explorer" ? "bioquest_human_systems_v1" : round.game === "history-timeline" ? "chronicle_vault_v1" : round.game === "circuit-logic" ? "circuit_forge_v1" : "adaptive_director_v1",
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
  return { ...publicRound, learningPlan: publicAdaptiveLearningPlan(learningPlan), ...decorated };
}
