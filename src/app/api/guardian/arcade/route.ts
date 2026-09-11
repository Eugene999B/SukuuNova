import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { ForbiddenError, routeError } from "@/lib/errors";
import { arcadeOverview, guardianArcadeLeaderboard, readArcadeRound } from "@/lib/arcade-service";
import { saveArcadeRoundWithTelemetry } from "@/lib/arcade-telemetry-service";
import { startVariedArcadeRound } from "@/lib/arcade-varied-service";
import { fingerprintNovaCoreInput, recordNovaCoreDecisionBestEffort } from "@/lib/novacore/decision-ledger";

const ageBand = z.enum(["age_4_5","age_6_8","age_9_11","age_12_14","age_15_18"]);
const typingTelemetry = z.object({
  version: z.literal(1),
  final: z.boolean(),
  elapsedMs: z.number().finite().min(0).max(3600000),
  totalKeystrokes: z.number().int().min(0).max(100000),
  correctKeystrokes: z.number().int().min(0).max(100000),
  accuracy: z.number().finite().min(0).max(100),
  wpm: z.number().finite().min(0).max(300),
  troublesomeKeys: z.array(z.object({ key: z.string().length(1), count: z.number().int().min(1).max(999) })).max(24),
});
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), studentId: z.string().min(1).max(100), game: z.string().min(1).max(100), ageBand: ageBand.optional(), easier: z.boolean().optional(), roundLength: z.number().int().min(1).max(50).optional(), challengeMode: z.boolean().optional() }),
  z.object({ action: z.literal("view"), roundId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("save"), roundId: z.string().min(1).max(100), answers: z.array(z.string().max(300)).min(1).max(50), finish: z.boolean(), typingTelemetry: typingTelemetry.optional() })
]);
const leaderboardQuery = z.object({
  studentId: z.string().min(1).max(100),
  game: z.string().min(1).max(100),
  scope: z.enum(["class","standard","age","school"]).default("standard"),
  period: z.enum(["weekly","monthly","all"]).default("weekly"),
  ageBand: ageBand.optional(),
});
const json = (data: unknown) => NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
async function session() {
  const current = await requireGuardianSession();
  if (current.needsPasswordChange) throw new ForbiddenError("Change your temporary password before opening Learning Arcade.");
  return current;
}
export async function GET(request: Request) {
  try {
    const current = await session(), url = new URL(request.url);
    if (url.searchParams.get("view") === "leaderboard") {
      const input = leaderboardQuery.parse({ studentId: url.searchParams.get("studentId") ?? "", game: url.searchParams.get("game") ?? "", scope: url.searchParams.get("scope") ?? undefined, period: url.searchParams.get("period") ?? undefined, ageBand: url.searchParams.get("ageBand") ?? undefined });
      return json(await withTenant(current.schoolId, (tx) => guardianArcadeLeaderboard(tx, current, input)));
    }
    return json(await withTenant(current.schoolId, (tx) => arcadeOverview(tx, current, url.searchParams.get("studentId") || undefined)));
  } catch (error) { return routeError(error); }
}
export async function POST(request: Request) {
  try {
    const current = await session(), input = await parseJson(request, schema);
    return json(await withTenant(current.schoolId, async (tx) => {
      if (input.action === "start") {
        const startedAt = Date.now();
        const round = await startVariedArcadeRound(tx, current, input);
        if (input.game === "force-motion-lab") {
          const physicsScenes = round.questions.filter((question) => question.kind === "simulation" && Boolean(question.scene)).length;
          await recordNovaCoreDecisionBestEffort(tx, {
            schoolId: current.schoolId,
            algorithmKey: "arcade.physics",
            entityType: "ArcadeRound",
            entityId: round.id,
            inputFingerprint: fingerprintNovaCoreInput({
              game: round.game,
              difficulty: round.difficulty,
              ageBand: round.ageBand,
              standardBand: round.standardBand,
              roundLength: round.roundLength,
              engine: round.engine,
            }),
            confidence: 1,
            reasonCodes: ["deterministic_fixed_timestep", "measured_force_motion_round"],
            outputSummary: {
              game: round.game,
              difficulty: round.difficulty,
              roundLength: round.roundLength,
              physicsScenes,
              challengeMode: round.challengeMode,
            },
            latencyMs: Date.now() - startedAt,
          });
        }
        return round;
      }
      if (input.action === "view") return readArcadeRound(tx, current, input.roundId);
      return saveArcadeRoundWithTelemetry(tx, current, input);
    }));
  } catch (error) { return routeError(error); }
}
