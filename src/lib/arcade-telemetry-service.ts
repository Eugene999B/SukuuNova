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
type SnapshotRow = { settingsSnapshot: unknown };

function clampInt(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.trunc(Number.isFinite(value) ? value : minimum)));
}

function normalizeKey(value: string) {
  return value.length === 1 && value >= " " && value !== "\u007f" ? value : "";
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function telemetryFromSnapshot(snapshot: unknown) {
  const candidate = object(object(snapshot).typingTelemetry);
  if (candidate.version !== 1 || !Array.isArray(candidate.troublesomeKeys)) return null;
  if (![candidate.elapsedMs, candidate.totalKeystrokes, candidate.correctKeystrokes].every((item) => typeof item === "number")) return null;
  const troublesomeKeys = candidate.troublesomeKeys.flatMap((item) => {
    const row = object(item);
    return typeof row.key === "string" && typeof row.count === "number" ? [{ key: row.key, count: row.count }] : [];
  });
  return normalizeTypingTelemetry({
    version: 1,
    final: candidate.final === true,
    elapsedMs: candidate.elapsedMs as number,
    totalKeystrokes: candidate.totalKeystrokes as number,
    correctKeystrokes: candidate.correctKeystrokes as number,
    accuracy: typeof candidate.accuracy === "number" ? candidate.accuracy : 0,
    wpm: typeof candidate.wpm === "number" ? candidate.wpm : 0,
    troublesomeKeys,
  }, candidate.final === true);
}

export function mergeTypingTelemetry(snapshot: unknown, incoming: TypingTelemetry | undefined, finish: boolean) {
  const previous = telemetryFromSnapshot(snapshot);
  if (previous?.final) return previous;
  const next = normalizeTypingTelemetry(incoming, finish);
  if (!next) return previous;
  if (!previous) return next;
  const trouble = new Map<string, number>();
  for (const item of [...previous.troublesomeKeys, ...next.troublesomeKeys]) {
    trouble.set(item.key, Math.min(999, (trouble.get(item.key) ?? 0) + item.count));
  }
  return normalizeTypingTelemetry({
    version: 1,
    final: finish,
    elapsedMs: Math.min(3600000, previous.elapsedMs + next.elapsedMs),
    totalKeystrokes: Math.min(100000, previous.totalKeystrokes + next.totalKeystrokes),
    correctKeystrokes: Math.min(100000, previous.correctKeystrokes + next.correctKeystrokes),
    accuracy: 0,
    wpm: 0,
    troublesomeKeys: [...trouble.entries()].map(([key, count]) => ({ key, count })),
  }, finish);
}

export async function saveArcadeRoundWithTelemetry(tx: TenantDb, context: Context, input: SaveInput) {
  const result = await saveArcadeRound(tx, context, { roundId: input.roundId, answers: input.answers, finish: input.finish });
  if (!input.typingTelemetry || result.game !== "keyboard-ninja") return result;
  const snapshotRows = await tx.$queryRaw<SnapshotRow[]>`
    SELECT "settingsSnapshot" FROM "ArcadeRound"
    WHERE "id"=${input.roundId} AND "schoolId"=${context.schoolId} LIMIT 1
  `;
  const previous = telemetryFromSnapshot(snapshotRows[0]?.settingsSnapshot);
  if (previous?.final) return { ...result, typingTelemetry: previous };
  const merged = mergeTypingTelemetry(snapshotRows[0]?.settingsSnapshot, input.typingTelemetry, input.finish);
  if (!merged) return result;
  await tx.$executeRaw`
    UPDATE "ArcadeRound"
    SET "settingsSnapshot"=jsonb_set(COALESCE("settingsSnapshot",'{}'::jsonb),'{typingTelemetry}',${JSON.stringify(merged)}::jsonb,true)
    WHERE "id"=${input.roundId} AND "schoolId"=${context.schoolId}
  `;
  return { ...result, typingTelemetry: merged };
}
