import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { schoolDay } from "./arcade-content";
import type { ArcadeAgeBand, ArcadeStandardBand } from "./arcade-catalog";

export type ArcadeLeaderboardScope = "class" | "standard" | "age" | "school";
export type ArcadeLeaderboardPeriod = "weekly" | "monthly" | "all";
function previousDate(day: string, days: number) { return new Date(Date.parse(day + "T12:00:00Z") - days * 86400000).toISOString().slice(0, 10); }
export function arcadeLeaderboardStartDate(now: Date, timezone: string, period: ArcadeLeaderboardPeriod) {
  if (period === "all") return null;
  const today = schoolDay(now, timezone);
  if (period === "monthly") return today.slice(0, 8) + "01";
  const weekday = new Date(today + "T12:00:00Z").getUTCDay();
  return previousDate(today, weekday === 0 ? 6 : weekday - 1);
}
export function leaderboardDisplayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Learner";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts.at(-1)![0].toUpperCase()}.`;
}
export async function arcadeLeaderboard(tx: TenantDb, input: {
  schoolId: string;
  gameKey: string;
  scope: ArcadeLeaderboardScope;
  period: ArcadeLeaderboardPeriod;
  timezone: string;
  classId?: string | null;
  standardBand?: ArcadeStandardBand | null;
  ageBand?: ArcadeAgeBand | null;
  limit?: number;
}) {
  const startDate = arcadeLeaderboardStartDate(new Date(), input.timezone, input.period);
  if (input.scope === "class" && !input.classId) return [];
  if (input.scope === "standard" && !input.standardBand) return [];
  if (input.scope === "age" && !input.ageBand) return [];
  const scope = input.scope === "class" ? Prisma.sql`AND s."classId"=${input.classId}`
    : input.scope === "standard" ? Prisma.sql`AND r."standardBand"=${input.standardBand}`
    : input.scope === "age" ? Prisma.sql`AND r."ageBand"=${input.ageBand}` : Prisma.empty;
  const date = startDate ? Prisma.sql`AND r."localDate">=${startDate}` : Prisma.empty;
  const rows = await tx.$queryRaw<Array<{ studentId: string; name: string; bestScore: number; totalXp: number; rounds: number; lastPlayed: Date }>>`
    WITH scored AS (
      SELECT r."studentId",r."xp",r."completedAt",
        CASE WHEN r."score">0 THEN r."score" ELSE ROUND((r."correct"::numeric / GREATEST(r."roundLength",1)) * 10000)::int + r."difficulty"*100 END AS "computedScore"
      FROM "ArcadeRound" r
      JOIN "Student" s ON s."id"=r."studentId" AND s."schoolId"=r."schoolId"
      WHERE r."schoolId"=${input.schoolId} AND r."game"=${input.gameKey} AND r."status"='completed' AND s."status"='active' ${date} ${scope}
    )
    SELECT sc."studentId",s."name",MAX(sc."computedScore")::int AS "bestScore",SUM(sc."xp")::int AS "totalXp",COUNT(*)::int AS "rounds",MAX(sc."completedAt") AS "lastPlayed"
    FROM scored sc JOIN "Student" s ON s."id"=sc."studentId" AND s."schoolId"=${input.schoolId}
    GROUP BY sc."studentId",s."name"
    ORDER BY "bestScore" DESC,"totalXp" DESC,"lastPlayed" ASC
    LIMIT ${Math.min(50, Math.max(1, input.limit ?? 20))}
  `;
  return rows.map((row, index) => ({
    rank: index + 1,
    studentId: row.studentId,
    displayName: leaderboardDisplayName(row.name),
    bestScore: row.bestScore,
    totalXp: row.totalXp,
    rounds: row.rounds,
    lastPlayed: row.lastPlayed,
  }));
}
