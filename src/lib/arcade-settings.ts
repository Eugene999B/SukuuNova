import type { TenantDb } from "./db";
import { ARCADE_GAME_CATALOG, type ArcadeAgeBand, type ArcadeGameDefinition, type ArcadeStandardBand } from "./arcade-catalog";
import { canGenerateArcadeContent } from "./arcade-content";
import { canGenerateArcadeInteractionContent } from "./arcade-interaction-content";
import { canGenerateArcadeResponseContent } from "./arcade-response-content";
import { canGenerateArcadeWorldContent } from "./arcade-world-content";

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
    const contentReady = canGenerateArcadeContent(definition.gameKey)
      || canGenerateArcadeInteractionContent(definition.gameKey)
      || canGenerateArcadeResponseContent(definition.gameKey)
      || canGenerateArcadeWorldContent(definition.gameKey);
    const overrideLength = row?.defaultRoundLength ?? null;
    const effectiveRoundLength = overrideLength && definition.roundLengths.includes(overrideLength) ? overrideLength : definition.defaultRoundLength;
    const flagshipAgeBands: readonly ArcadeAgeBand[] = definition.gameKey === "number-pop"
      ? ["age_4_5"]
      : definition.gameKey === "logic"
        ? ["age_6_8", "age_9_11", "age_12_14", "age_15_18"]
        : definition.ageBands;
    const flagshipDefinition = definition.gameKey === "logic"
      ? {
          ...definition,
          name: "Nova Millionaire",
          category: "Logic & Reasoning",
          description: "Climb an untimed knowledge-show ladder through patterns, sequences, classification and deduction.",
          symbol: "♛",
          curriculumTags: ["patterns", "sequences", "classification", "deduction", "reasoning"] as const,
        }
      : definition.gameKey === "sentence-scramble"
        ? {
            ...definition,
            name: "Animation Story Lab",
            category: "Creative Writing & Media",
            description: "Create mini animations freely, then practise sequencing, dialogue, cause and effect, camera choices and revision through untimed director missions.",
            symbol: "▰",
            curriculumTags: ["story-sequencing", "sentence-structure", "dialogue", "cause-effect", "visual-storytelling", "revision"] as const,
          }
        : definition;
    return {
      ...flagshipDefinition,
      live: contentReady,
      enabled: contentReady && (row?.enabled ?? true),
      effectiveAgeBands: intersect(flagshipAgeBands, stringArray(row?.allowedAgeBands)) as ArcadeAgeBand[],
      effectiveStandardBands: intersect(definition.standardBands, stringArray(row?.allowedStandardBands)) as ArcadeStandardBand[],
      effectiveRoundLength,
      timedChallengesEnabled: definition.timerPolicy !== "none" && Boolean(row?.timedChallengesEnabled),
      dailyGuidanceRounds: row?.dailyGuidanceRounds ?? null,
      contentPackKeys: stringArray(row?.contentPackKeys),
    };
  });
}
