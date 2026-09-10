import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { NOVACORE_ALGORITHMS } from "./registry";

export const ETA_SHADOW_ALGORITHM_VERSION = NOVACORE_ALGORITHMS.find((algorithm) => algorithm.key === "transport.eta")?.version ?? "1.0.0";
const MAX_EVALUATION_LOOKBACK_MINUTES = 120;

type EtaPredictionInput = {
  schoolId: string;
  tripId: string;
  pickupPointId: string;
  predictedAt: Date;
  predictedMinutes: number;
  confidenceMinutes: number | null;
  distanceMode: "route" | "direct";
  routeRemainingMeters: number | null;
};

type EtaEvaluationRow = {
  absoluteErrorMinutes: string;
  confidenceMinutes: number | null;
};

export type EtaArrivalEvaluation = {
  evaluatedPredictions: number;
  maeMinutes: number | null;
  medianErrorMinutes: number | null;
  p90ErrorMinutes: number | null;
  within2MinutesRate: number | null;
  within5MinutesRate: number | null;
  withinConfidenceRate: number | null;
};

function percentile(sorted: number[], ratio: number) {
  if (!sorted.length) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function rounded(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

async function bestEffort<T>(tx: TenantDb, work: () => Promise<T>): Promise<T | null> {
  const savepoint = `novacore_eta_${createId().replace(/[^a-zA-Z0-9_]/g, "")}`;
  try {
    await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
    try {
      const result = await work();
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
      return null;
    }
  } catch {
    return null;
  }
}

export async function recordEtaShadowPredictionBestEffort(tx: TenantDb, input: EtaPredictionInput) {
  if (!input.schoolId || !input.tripId || !input.pickupPointId) return null;
  if (!Number.isInteger(input.predictedMinutes) || input.predictedMinutes < 0) return null;
  if (input.confidenceMinutes != null && (!Number.isInteger(input.confidenceMinutes) || input.confidenceMinutes < 0)) return null;
  if (input.routeRemainingMeters != null && (!Number.isFinite(input.routeRemainingMeters) || input.routeRemainingMeters < 0)) return null;
  if (Number.isNaN(input.predictedAt.getTime())) return null;

  const predictionBucket = Math.floor(input.predictedAt.getTime() / 60_000);
  return bestEffort(tx, async () => {
    const inserted = await tx.$executeRawUnsafe(
      `INSERT INTO "NovaCoreEtaPrediction"
        ("id","schoolId","tripId","pickupPointId","predictionBucket","predictedAt","predictedMinutes","confidenceMinutes","distanceMode","routeRemainingMeters","algorithmVersion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT ("schoolId","tripId","pickupPointId","predictionBucket","algorithmVersion") DO NOTHING`,
      createId(),
      input.schoolId,
      input.tripId,
      input.pickupPointId,
      predictionBucket,
      input.predictedAt,
      input.predictedMinutes,
      input.confidenceMinutes,
      input.distanceMode,
      input.routeRemainingMeters,
      ETA_SHADOW_ALGORITHM_VERSION,
    );
    return { inserted: Number(inserted ?? 0), predictionBucket, algorithmVersion: ETA_SHADOW_ALGORITHM_VERSION };
  });
}

export async function evaluateEtaArrivalBestEffort(tx: TenantDb, input: {
  schoolId: string;
  tripId: string;
  pickupPointId: string;
  actualArrivalAt: Date;
}): Promise<EtaArrivalEvaluation | null> {
  if (!input.schoolId || !input.tripId || !input.pickupPointId || Number.isNaN(input.actualArrivalAt.getTime())) return null;

  return bestEffort(tx, async () => {
    const rows = await tx.$queryRawUnsafe<EtaEvaluationRow[]>(
      `UPDATE "NovaCoreEtaPrediction"
       SET "actualArrivalAt"=$4::timestamp,
           "absoluteErrorMinutes"=ABS(EXTRACT(EPOCH FROM ($4::timestamp - "predictedAt")) / 60.0 - "predictedMinutes"),
           "evaluatedAt"=CURRENT_TIMESTAMP
       WHERE "schoolId"=$1
         AND "tripId"=$2
         AND "pickupPointId"=$3
         AND "algorithmVersion"=$5
         AND "actualArrivalAt" IS NULL
         AND "predictedAt" <= $4::timestamp
         AND "predictedAt" >= $4::timestamp - ($6::integer * INTERVAL '1 minute')
       RETURNING "absoluteErrorMinutes"::text,"confidenceMinutes"`,
      input.schoolId,
      input.tripId,
      input.pickupPointId,
      input.actualArrivalAt,
      ETA_SHADOW_ALGORITHM_VERSION,
      MAX_EVALUATION_LOOKBACK_MINUTES,
    );

    const errors = rows.map((row) => Number(row.absoluteErrorMinutes)).filter(Number.isFinite).sort((a, b) => a - b);
    if (!errors.length) {
      return {
        evaluatedPredictions: 0,
        maeMinutes: null,
        medianErrorMinutes: null,
        p90ErrorMinutes: null,
        within2MinutesRate: null,
        within5MinutesRate: null,
        withinConfidenceRate: null,
      };
    }

    const maeMinutes = errors.reduce((sum, value) => sum + value, 0) / errors.length;
    const withinConfidenceRows = rows.filter((row) => row.confidenceMinutes != null && Number.isFinite(Number(row.absoluteErrorMinutes)));
    const withinConfidence = withinConfidenceRows.filter((row) => Number(row.absoluteErrorMinutes) <= Number(row.confidenceMinutes)).length;
    return {
      evaluatedPredictions: errors.length,
      maeMinutes: rounded(maeMinutes),
      medianErrorMinutes: rounded(percentile(errors, 0.5) ?? 0),
      p90ErrorMinutes: rounded(percentile(errors, 0.9) ?? 0),
      within2MinutesRate: rounded(errors.filter((value) => value <= 2).length / errors.length, 3),
      within5MinutesRate: rounded(errors.filter((value) => value <= 5).length / errors.length, 3),
      withinConfidenceRate: withinConfidenceRows.length ? rounded(withinConfidence / withinConfidenceRows.length, 3) : null,
    };
  });
}

export async function summarizeEtaShadowAccuracy(tx: TenantDb, input: { schoolId: string; days?: number }) {
  const days = Math.max(1, Math.min(90, Math.floor(input.days ?? 30)));
  const rows = await tx.$queryRawUnsafe<Array<{
    samples: number;
    maeMinutes: string | null;
    medianErrorMinutes: string | null;
    p90ErrorMinutes: string | null;
    within2MinutesRate: string | null;
    within5MinutesRate: string | null;
    withinConfidenceRate: string | null;
  }>>(
    `SELECT COUNT(*)::int AS "samples",
            AVG("absoluteErrorMinutes")::text AS "maeMinutes",
            (percentile_cont(0.5) WITHIN GROUP (ORDER BY "absoluteErrorMinutes"))::text AS "medianErrorMinutes",
            (percentile_cont(0.9) WITHIN GROUP (ORDER BY "absoluteErrorMinutes"))::text AS "p90ErrorMinutes",
            AVG(CASE WHEN "absoluteErrorMinutes" <= 2 THEN 1.0 ELSE 0.0 END)::text AS "within2MinutesRate",
            AVG(CASE WHEN "absoluteErrorMinutes" <= 5 THEN 1.0 ELSE 0.0 END)::text AS "within5MinutesRate",
            AVG(CASE WHEN "confidenceMinutes" IS NULL THEN NULL WHEN "absoluteErrorMinutes" <= "confidenceMinutes" THEN 1.0 ELSE 0.0 END)::text AS "withinConfidenceRate"
     FROM "NovaCoreEtaPrediction"
     WHERE "schoolId"=$1
       AND "algorithmVersion"=$2
       AND "evaluatedAt" IS NOT NULL
       AND "evaluatedAt" >= CURRENT_TIMESTAMP - ($3::integer * INTERVAL '1 day')`,
    input.schoolId,
    ETA_SHADOW_ALGORITHM_VERSION,
    days,
  );
  const row = rows[0];
  const numberOrNull = (value: string | null | undefined, places = 2) => value == null ? null : rounded(Number(value), places);
  return {
    schoolId: input.schoolId,
    algorithmVersion: ETA_SHADOW_ALGORITHM_VERSION,
    days,
    samples: Number(row?.samples ?? 0),
    maeMinutes: numberOrNull(row?.maeMinutes),
    medianErrorMinutes: numberOrNull(row?.medianErrorMinutes),
    p90ErrorMinutes: numberOrNull(row?.p90ErrorMinutes),
    within2MinutesRate: numberOrNull(row?.within2MinutesRate, 3),
    within5MinutesRate: numberOrNull(row?.within5MinutesRate, 3),
    withinConfidenceRate: numberOrNull(row?.withinConfidenceRate, 3),
  };
}
