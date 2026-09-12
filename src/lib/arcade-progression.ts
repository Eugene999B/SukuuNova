import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { ForbiddenError } from "./errors";
import { learningStreak, schoolDay } from "./arcade-content";
import { standardBandFromClassLevel } from "./arcade-catalog";
import { leaderboardDisplayName } from "./arcade-leaderboard";

const UNIVERSE_GAMES = ["number-pop", "math", "keyboard-ninja", "force-motion-lab", "word", "comprehension-quest", "coding-sequence", "ghana-map-master", "money-math-market", "cyber-safety", "environment-guardian", "body-explorer", "history-timeline", "circuit-logic", "culture-heritage", "space-explorer"] as const;

type Context = { schoolId: string; guardianId: string; userId: string };
type ProgressStats = {
  rounds: number;
  xp: number;
  stars: number;
  correct: number;
  questions: number;
  games: number;
  perfectRounds: number;
  bossWins: number;
};

type Mission = {
  key: string;
  title: string;
  description: string;
  current: number;
  target: number;
  unit: string;
  complete: boolean;
};

type Achievement = {
  key: string;
  symbol: string;
  title: string;
  description: string;
  current: number;
  target: number;
  unlocked: boolean;
};

const emptyStats = (): ProgressStats => ({ rounds: 0, xp: 0, stars: 0, correct: 0, questions: 0, games: 0, perfectRounds: 0, bossWins: 0 });

function previousDate(day: string, days: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
}
function schoolWeekStart(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return previousDate(day, weekday === 0 ? 6 : weekday - 1);
}
function mission(key: string, title: string, description: string, current: number, target: number, unit: string): Mission {
  return { key, title, description, current, target, unit, complete: current >= target };
}
function achievement(key: string, symbol: string, title: string, description: string, current: number, target: number): Achievement {
  return { key, symbol, title, description, current, target, unlocked: current >= target };
}

export function arcadeUniverseLevel(totalXp: number) {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const levelSize = 250;
  return {
    level: 1 + Math.floor(safeXp / levelSize),
    xpIntoLevel: safeXp % levelSize,
    xpForNextLevel: levelSize,
    xpRemaining: levelSize - (safeXp % levelSize),
  };
}

export function buildArcadeProgression(stats: ProgressStats, today: ProgressStats, week: ProgressStats, streak: number) {
  const accuracy = stats.questions ? Math.round((stats.correct / stats.questions) * 100) : null;
  const level = arcadeUniverseLevel(stats.xp);
  const achievements = [
    achievement("first-mission", "✦", "First Launch", "Complete your first Learning Arcade mission.", stats.rounds, 1),
    achievement("star-pilot", "★", "Star Pilot", "Earn a perfect three-star result.", stats.perfectRounds, 1),
    achievement("three-worlds", "◈", "World Hopper", "Complete missions across three different learning games.", stats.games, 3),
    achievement("streak-three", "⚡", "Momentum", "Build a three-day learning streak.", streak, 3),
    achievement("streak-seven", "☄", "Seven-Day Nova", "Keep learning for seven school days in a row.", streak, 7),
    achievement("xp-500", "⬢", "Nova Explorer", "Earn 500 total Arcade XP.", stats.xp, 500),
    achievement("xp-1500", "◆", "Nova Vanguard", "Earn 1,500 total Arcade XP.", stats.xp, 1500),
    achievement("precision-90", "◎", "Precision Scholar", "Hold at least 90% accuracy after 50 graded checkpoints.", accuracy !== null && stats.questions >= 50 && accuracy >= 90 ? 1 : 0, 1),
    achievement("boss-breaker", "♛", "Boss Breaker", "Clear a difficulty-five mission with three stars.", stats.bossWins, 1),
  ];
  return {
    profile: {
      totalXp: stats.xp,
      totalRounds: stats.rounds,
      totalStars: stats.stars,
      accuracy,
      novaCoins: Math.floor(stats.xp / 10) + stats.stars * 2,
      streak,
      ...level,
    },
    dailyMissions: [
      mission("daily-play", "Launch sequence", "Complete one learning mission today.", today.rounds, 1, "mission"),
      mission("daily-variety", "Double world", "Play two different learning games today.", today.games, 2, "games"),
      mission("daily-stars", "Star sweep", "Collect five stars today.", today.stars, 5, "stars"),
    ],
    weeklyChallenges: [
      mission("weekly-rounds", "Arcade regular", "Complete five missions this school week.", week.rounds, 5, "missions"),
      mission("weekly-worlds", "Three-world tour", "Visit three different learning worlds this week.", week.games, 3, "games"),
      mission("weekly-xp", "Nova charge", "Earn 300 XP this school week.", week.xp, 300, "XP"),
    ],
    achievements,
    unlockedAchievements: achievements.filter((item) => item.unlocked).length,
  };
}

export async function guardianArcadeProgression(tx: TenantDb, context: Context, studentId: string) {
  const child = await tx.student.findFirst({
    where: {
      id: studentId,
      schoolId: context.schoolId,
      status: "active",
      guardians: { some: { guardianId: context.guardianId, schoolId: context.schoolId } },
    },
    select: { id: true, class: { select: { level: true } } },
  });
  if (!child) throw new ForbiddenError("Choose an active child linked to your guardian account.");

  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: context.schoolId }, select: { timezone: true } });
  const today = schoolDay(new Date(), settings?.timezone ?? "Africa/Accra");
  const weekStart = schoolWeekStart(today);
  const standardBand = standardBandFromClassLevel(child.class?.level ?? null);
  const gameList = Prisma.join(UNIVERSE_GAMES);

  const summarySql = (extra: Prisma.Sql) => tx.$queryRaw<ProgressStats[]>`
    SELECT COUNT(*)::int AS "rounds",
      COALESCE(SUM("xp"),0)::int AS "xp",
      COALESCE(SUM("stars"),0)::int AS "stars",
      COALESCE(SUM("correct"),0)::int AS "correct",
      COALESCE(SUM("roundLength"),0)::int AS "questions",
      COUNT(DISTINCT "game")::int AS "games",
      COUNT(*) FILTER (WHERE "stars"=3)::int AS "perfectRounds",
      COUNT(*) FILTER (WHERE "stars"=3 AND "difficulty">=5)::int AS "bossWins"
    FROM "ArcadeRound"
    WHERE "schoolId"=${context.schoolId} AND "studentId"=${child.id} AND "status"='completed' ${extra}
  `;

  const [allRows, todayRows, weekRows, dateRows, championRows] = await Promise.all([
    summarySql(Prisma.empty),
    summarySql(Prisma.sql`AND "localDate"=${today}`),
    summarySql(Prisma.sql`AND "localDate">=${weekStart}`),
    tx.arcadeRound.findMany({ where: { schoolId: context.schoolId, studentId: child.id, status: "completed" }, select: { localDate: true }, distinct: ["localDate"] }),
    tx.$queryRaw<Array<{ studentId: string; name: string; totalXp: number; totalStars: number; rounds: number }>>`
      SELECT r."studentId",s."name",COALESCE(SUM(r."xp"),0)::int AS "totalXp",COALESCE(SUM(r."stars"),0)::int AS "totalStars",COUNT(*)::int AS "rounds"
      FROM "ArcadeRound" r
      JOIN "Student" s ON s."id"=r."studentId" AND s."schoolId"=r."schoolId"
      WHERE r."schoolId"=${context.schoolId} AND r."status"='completed' AND s."status"='active'
        AND r."standardBand"=${standardBand} AND r."game" IN (${gameList})
      GROUP BY r."studentId",s."name"
      ORDER BY "totalXp" DESC,"totalStars" DESC,"rounds" DESC
      LIMIT 10
    `,
  ]);

  const streak = learningStreak(dateRows.flatMap((row) => row.localDate ? [row.localDate] : []), today);
  return {
    ...buildArcadeProgression(allRows[0] ?? emptyStats(), todayRows[0] ?? emptyStats(), weekRows[0] ?? emptyStats(), streak),
    champions: championRows.map((row, index) => ({
      rank: index + 1,
      studentId: row.studentId,
      displayName: leaderboardDisplayName(row.name),
      totalXp: row.totalXp,
      totalStars: row.totalStars,
      rounds: row.rounds,
      isCurrent: row.studentId === child.id,
    })),
    period: { schoolDay: today, schoolWeekStart: weekStart },
  };
}
