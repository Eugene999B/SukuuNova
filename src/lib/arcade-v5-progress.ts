import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { ARCADE_V5_IDENTITIES, arcadeGameRewardCount, arcadeV5Progression, type ArcadeV5GameKey } from "./arcade-v5-design";

type Context = { schoolId: string; guardianId: string; userId: string };
type ProgressRow = {
  game: string;
  rounds: number;
  v5Rounds: number;
  maxProgressionNode: number;
  xp: number;
  stars: number;
  correct: number;
  questions: number;
};

const GAME_KEYS = Object.keys(ARCADE_V5_IDENTITIES) as ArcadeV5GameKey[];

export function arcadeV5NodeState(game: string, rounds: number, v5Rounds: number, maxProgressionNode: number) {
  const progression = arcadeV5Progression(game);
  const safeRounds = Math.max(0, Math.trunc(rounds));
  const safeV5Rounds = Math.max(0, Math.min(safeRounds, Math.trunc(v5Rounds)));
  const nodeCount = progression.nodes.length;
  if (!progression.selectableNodes || nodeCount === 0) {
    return { legacyRounds: Math.max(0, safeRounds - safeV5Rounds), nodeCount: 0, clearedThroughNode: null, unlockedNode: null };
  }
  const safeMax = Math.max(0, Math.min(nodeCount, Math.trunc(maxProgressionNode)));
  const legacyRounds = Math.max(0, safeRounds - safeV5Rounds);
  const legacyUnlock = Math.min(nodeCount, 1 + legacyRounds);
  const v5Unlock = safeMax > 0 ? Math.min(nodeCount, safeMax + 1) : 1;
  return {
    legacyRounds,
    nodeCount,
    clearedThroughNode: Math.min(nodeCount, Math.max(Math.min(legacyRounds, nodeCount), safeMax)),
    unlockedNode: Math.max(1, legacyUnlock, v5Unlock),
  };
}

export async function guardianArcadeV5Progress(tx: TenantDb, context: Context, studentId: string) {
  const child = await tx.student.findFirst({
    where: {
      id: studentId,
      schoolId: context.schoolId,
      status: "active",
      guardians: { some: { guardianId: context.guardianId, schoolId: context.schoolId } },
    },
    select: { id: true },
  });
  if (!child) throw new ForbiddenError("Choose an active child linked to your guardian account.");

  const rows = await tx.$queryRaw<ProgressRow[]>`
    SELECT "game",
      COUNT(*)::int AS "rounds",
      COUNT(*) FILTER (WHERE "settingsSnapshot" ? 'progressionMode' OR "settingsSnapshot" ? 'selectedLevel')::int AS "v5Rounds",
      COALESCE(MAX(CASE
        WHEN ("settingsSnapshot"->>'progressionNode') ~ '^[0-9]+$' THEN ("settingsSnapshot"->>'progressionNode')::int
        WHEN ("settingsSnapshot"->>'selectedLevel') ~ '^[0-9]+$' THEN ("settingsSnapshot"->>'selectedLevel')::int
        ELSE NULL END),0)::int AS "maxProgressionNode",
      COALESCE(SUM("xp"),0)::int AS "xp",
      COALESCE(SUM("stars"),0)::int AS "stars",
      COALESCE(SUM("correct"),0)::int AS "correct",
      COALESCE(SUM("roundLength"),0)::int AS "questions"
    FROM "ArcadeRound"
    WHERE "schoolId"=${context.schoolId} AND "studentId"=${child.id} AND "status"='completed'
    GROUP BY "game"
  `;

  return GAME_KEYS.map((game) => {
    const row = rows.find((item) => item.game === game);
    const rounds = row?.rounds ?? 0;
    const v5Rounds = row?.v5Rounds ?? 0;
    const maxProgressionNode = row?.maxProgressionNode ?? 0;
    const xp = row?.xp ?? 0;
    const stars = row?.stars ?? 0;
    const progression = arcadeV5Progression(game);
    const nodeState = arcadeV5NodeState(game, rounds, v5Rounds, maxProgressionNode);
    return {
      game,
      rounds,
      v5Rounds,
      progressionMode: progression.mode,
      modeLabel: progression.modeLabel,
      selectableNodes: progression.selectableNodes,
      nodeCount: nodeState.nodeCount,
      highestCompletedNode: maxProgressionNode || null,
      clearedThroughNode: nodeState.clearedThroughNode,
      unlockedNode: nodeState.unlockedNode,
      xp,
      stars,
      rewardCount: arcadeGameRewardCount(xp, stars),
      accuracy: row?.questions ? Math.round((row.correct / row.questions) * 100) : null,
    };
  });
}

export async function assertArcadeV5ProgressionAvailable(tx: TenantDb, context: Context, studentId: string, game: string, requestedNode?: number | null) {
  const progression = arcadeV5Progression(game);
  const progress = await guardianArcadeV5Progress(tx, context, studentId);
  const gameProgress = progress.find((item) => item.game === game);
  if (!gameProgress) throw new AppError("Choose an available flagship game.", 400, "INVALID_GAME");
  if (!progression.selectableNodes) return gameProgress;
  const node = Math.max(1, Math.min(progression.nodes.length, Math.trunc(requestedNode ?? 1)));
  if (requestedNode && requestedNode > progression.nodes.length) throw new AppError(`Choose an available ${progression.unitLabel}.`, 400, "ARCADE_NODE_INVALID");
  if (node > (gameProgress.unlockedNode ?? 1)) throw new AppError(`${progression.unitLabel[0].toUpperCase()}${progression.unitLabel.slice(1)} ${node} is still locked. Clear the earlier ${progression.unitLabel} first.`, 409, "ARCADE_NODE_LOCKED");
  return gameProgress;
}
