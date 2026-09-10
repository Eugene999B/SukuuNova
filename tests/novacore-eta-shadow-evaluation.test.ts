import { describe, expect, it } from "vitest";
import {
  ETA_SHADOW_ALGORITHM_VERSION,
  evaluateEtaArrivalBestEffort,
  recordEtaShadowPredictionBestEffort,
} from "../src/lib/novacore/eta-shadow-evaluation";

describe("NovaCore ETA shadow evaluation", () => {
  it("records at most a minute-bucketed shadow prediction through an isolated savepoint", async () => {
    const statements: string[] = [];
    const tx = {
      $executeRawUnsafe: async (sql: string, ..._params: unknown[]) => {
        statements.push(sql);
        return sql.includes('INSERT INTO "NovaCoreEtaPrediction"') ? 1 : 0;
      },
    } as never;
    const predictedAt = new Date("2026-09-10T07:31:42.000Z");
    const result = await recordEtaShadowPredictionBestEffort(tx, {
      schoolId: "school-1",
      tripId: "trip-1",
      pickupPointId: "pickup-1",
      predictedAt,
      predictedMinutes: 8,
      confidenceMinutes: 3,
      distanceMode: "route",
      routeRemainingMeters: 4200,
    });

    expect(result?.inserted).toBe(1);
    expect(result?.predictionBucket).toBe(Math.floor(predictedAt.getTime() / 60_000));
    expect(result?.algorithmVersion).toBe(ETA_SHADOW_ALGORITHM_VERSION);
    expect(statements[0]).toMatch(/^SAVEPOINT novacore_eta_/);
    expect(statements.some((sql) => sql.includes('INSERT INTO "NovaCoreEtaPrediction"'))).toBe(true);
    expect(statements.some((sql) => sql.startsWith("RELEASE SAVEPOINT novacore_eta_"))).toBe(true);
  });

  it("calculates MAE, median, P90 and confidence coverage from actual arrival", async () => {
    const statements: string[] = [];
    const tx = {
      $executeRawUnsafe: async (sql: string) => {
        statements.push(sql);
        return 0;
      },
      $queryRawUnsafe: async (sql: string) => {
        statements.push(sql);
        return [
          { absoluteErrorMinutes: "1", confidenceMinutes: 2 },
          { absoluteErrorMinutes: "3", confidenceMinutes: 4 },
          { absoluteErrorMinutes: "7", confidenceMinutes: 8 },
        ];
      },
    } as never;

    const result = await evaluateEtaArrivalBestEffort(tx, {
      schoolId: "school-1",
      tripId: "trip-1",
      pickupPointId: "pickup-1",
      actualArrivalAt: new Date("2026-09-10T08:00:00.000Z"),
    });

    expect(result).toEqual({
      evaluatedPredictions: 3,
      maeMinutes: 3.67,
      medianErrorMinutes: 3,
      p90ErrorMinutes: 7,
      within2MinutesRate: 0.333,
      within5MinutesRate: 0.667,
      withinConfidenceRate: 1,
    });
    expect(statements.some((sql) => sql.includes('UPDATE "NovaCoreEtaPrediction"'))).toBe(true);
  });

  it("rejects malformed shadow predictions without touching the database", async () => {
    let calls = 0;
    const tx = { $executeRawUnsafe: async () => { calls += 1; return 0; } } as never;
    const result = await recordEtaShadowPredictionBestEffort(tx, {
      schoolId: "school-1",
      tripId: "trip-1",
      pickupPointId: "pickup-1",
      predictedAt: new Date("invalid"),
      predictedMinutes: -1,
      confidenceMinutes: null,
      distanceMode: "direct",
      routeRemainingMeters: null,
    });
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });
});
