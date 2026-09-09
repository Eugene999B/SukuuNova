import type { TenantDb } from "./db";
import { ARCADE_GAME_CATALOG, type ArcadeAgeBand, type ArcadeGameDefinition, type ArcadeStandardBand } from "./arcade-catalog";
import { canGenerateArcadeContent } from "./arcade-content";
import { canGenerateArcadeInteractionContent } from "./arcade-interaction-content";

type SettingRow = {
  gameKey: string;
  enabled: boolean;
  allowedAgeBands: unknown;
  allowedStandardBands: unknown;
  defaultRoundLength: number | null;
  timedChallengesEnabled: boolean;
  dailyGuidanceRounds: number | null;
  contentPackKeys: unknown;
};
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function intersect<T extends string>(base: readonly T[], override: string[]) {
  if (!override.length) return [...base];
  const allowed = new Set(override);
  return base.filter((item) => allowed.has(item));
}
export type EffectiveArcadeGame = ArcadeGameDefinition & {
  enabled: boolean;
  effectiveAgeBands: ArcadeAgeBand[];
  effectiveStandardBands: ArcadeStandardBand[];
  effectiveRoundLength: number;
  timedChallengesEnabled: boolean;
  dailyGuidanceRounds: number | null;
  contentPackKeys: string[];
};
export async function arcadeSchoolSettings(tx: TenantDb, schoolId: string) {
  const rows = await tx.$queryRaw<SettingRow[]>`
    SELECT "gameKey","enabled","allowedAgeBands","allowedStandardBands","defaultRoundLength","timedChallengesEnabled","dailyGuidanceRounds","contentPackKeys"
    FROM "ArcadeGameSetting" WHERE "schoolId"=${schoolId}
  `;
  return new Map(rows.map((row) => [row.gameKey, row]));
}
export async function effectiveArcadeCatalog(tx: TenantDb, schoolId: string): Promise<EffectiveArcadeGame[]> {
  const settings = await arcadeSchoolSettings(tx, schoolId);
  return ARCADE_GAME_CATALOG.map((definition) => {
    const row = settings.get(definition.gameKey);
    const contentReady = canGenerateArcadeContent(definition.gameKey) || canGenerateArcadeInteractionContent(definition.gameKey);
    const overrideLength = row?.defaultRoundLength ?? null;
    const effectiveRoundLength = overrideLength && definition.roundLengths.includes(overrideLength) ? overrideLength : definition.defaultRoundLength;
    return {
      ...definition,
      live: contentReady,
      enabled: contentReady && (row?.enabled ?? true),
      effectiveAgeBands: intersect(definition.ageBands, stringArray(row?.allowedAgeBands)) as ArcadeAgeBand[],
      effectiveStandardBands: intersect(definition.standardBands, stringArray(row?.allowedStandardBands)) as ArcadeStandardBand[],
      effectiveRoundLength,
      timedChallengesEnabled: definition.timerPolicy !== "none" && Boolean(row?.timedChallengesEnabled),
      dailyGuidanceRounds: row?.dailyGuidanceRounds ?? null,
      contentPackKeys: stringArray(row?.contentPackKeys),
    };
  });
}
