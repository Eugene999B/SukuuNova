import type { TenantDb } from "./db";
import { saveArcadeRound } from "./arcade-service";

export type TypingTroubleKey = { key: string; count: number };
export type TypingTelemetry = {
  version: 1;
  final: boolean;
  elapsedMs: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  accuracy: number;
  wpm: number;
  troublesomeKeys: TypingTroubleKey[];
};

type Context = { schoolId: string; guardianId: string; userId: string };
type SaveInput = { roundId: string; answers: string[]; finish: boolean; typingTelemetry?: TypingTelemetry };

function clampInt(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.trunc(Number.isFinite(value) ? value : minimum)));
}

function normalizeKey(value: string) {
  return value.length === 1 && value >= " " && value !== "\u007f" ? value : "";
}

export function normalizeTypingTelemetry(value: TypingTelemetry | undefined, finish: boolean): TypingTelemetry | null {
  if (!value) return null;
  const totalKeystrokes = clampInt(value.totalKeystrokes, 0, 100000);
  const correctKeystrokes = Math.min(totalKeystrokes, clampInt(value.correctKeystrokes, 0, 100000));
  const troublesome = new Map<string, number>();
  for (const item of value.troublesomeKeys.slice(0, 24)) {
    const key = normalizeKey(item.key);
    if (!key) continue;
    troublesome.set(key, Math.min(999, (troublesome.get(key) ?? 0) + clampInt(item.count, 1, 999)));
  }
  const accuracy = totalKeystrokes ? Math.round((correctKeystrokes / totalKeystrokes) * 1000) / 10 : 0;
  const elapsedMs = clampInt(value.elapsedMs, 0, 3600000);
  const minutes = Math.max(elapsedMs / 60000, 1 / 60);
  const wpm = Math.min(300, Math.round(((correctKeystrokes / 5) / minutes) * 10) / 10);
  return {
    version: 1,
    final: finish,
    elapsedMs,
    totalKeystrokes,
    correctKeystrokes,
    accuracy,
    wpm,
    troublesomeKeys: [...troublesome.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([key, count]) => ({ key, count })),
  };
}

export async function saveArcadeRoundWithTelemetry(tx: TenantDb, context: Context, input: SaveInput) {
  const result = await saveArcadeRound(tx, context, { roundId: input.roundId, answers: input.answers, finish: input.finish });
  const telemetry = normalizeTypingTelemetry(input.typingTelemetry, input.finish);
  if (!telemetry || result.game !== "keyboard-ninja") return result;
  if (input.finish) {
    await tx.$executeRaw`
      UPDATE "ArcadeRound"
      SET "settingsSnapshot"=jsonb_set(COALESCE("settingsSnapshot",'{}'::jsonb),'{typingTelemetry}',${JSON.stringify(telemetry)}::jsonb,true)
      WHERE "id"=${input.roundId} AND "schoolId"=${context.schoolId}
        AND COALESCE("settingsSnapshot"->'typingTelemetry'->>'final','false')<>'true'
    `;
  } else {
    await tx.$executeRaw`
      UPDATE "ArcadeRound"
      SET "settingsSnapshot"=jsonb_set(COALESCE("settingsSnapshot",'{}'::jsonb),'{typingTelemetry}',${JSON.stringify(telemetry)}::jsonb,true)
      WHERE "id"=${input.roundId} AND "schoolId"=${context.schoolId} AND "status"='in_progress'
    `;
  }
  return result;
}
