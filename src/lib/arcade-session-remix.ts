import { createHash, randomBytes } from "node:crypto";
import { ARCADE_SESSION_VARIETY_MIN, arcadeV5Progression } from "./arcade-v5-design";

const WORLD_STATES = ["Aurora", "Ember", "Prism", "Shadow", "Pulse", "Cascade", "Echo", "Vector", "Zenith", "Drift", "Beacon", "Storm", "Mirage", "Orbit", "Vault", "Summit"] as const;
const MISSION_FRAMES = ["rescue", "recovery", "relay", "investigation", "escort", "repair", "sprint", "defence", "collection", "puzzle", "checkpoint", "mastery"] as const;
const PRESSURE_PROFILES = ["calm", "steady", "rising", "precision", "resource-aware", "hazard-watch", "streak", "recovery", "boss-build", "mixed"] as const;
const OBJECTIVE_MODIFIERS = ["accuracy", "efficiency", "evidence", "combo", "safe-choice", "multi-step", "weak-skill", "speed-control", "mastery", "balanced"] as const;
const ENCOUNTER_PATTERNS = ["alternating", "clustered", "wave", "branching", "surprise", "escalating", "recovery-break", "boss-tail"] as const;
const BONUS_CONDITIONS = ["clean-streak", "precision", "no-rush", "evidence-chain", "efficient-route", "recovery", "mastery-chain", "steady-finish"] as const;

export type ArcadeSessionRemix = {
  version: 1;
  seedId: string;
  mutationKey: string;
  progressionMode: ReturnType<typeof arcadeV5Progression>["mode"];
  progressionNode: number | null;
  worldState: string;
  missionFrame: string;
  pressureProfile: string;
  objectiveModifier: string;
  encounterPattern: string;
  bonusCondition: string;
  varietyFloor: number;
};

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function pick<T extends readonly string[]>(seed: string, salt: string, values: T): T[number] {
  const hex = digest(`${seed}:${salt}`).slice(0, 8);
  return values[Number.parseInt(hex, 16) % values.length];
}

export function arcadeSessionVarietySpace() {
  return ARCADE_SESSION_VARIETY_MIN;
}

export function createArcadeSessionRemix(game: string, progressionNode?: number | null, seed = randomBytes(16).toString("hex")): ArcadeSessionRemix {
  const progression = arcadeV5Progression(game);
  const node = progression.selectableNodes && progressionNode
    ? Math.max(1, Math.min(progression.nodes.length, Math.trunc(progressionNode)))
    : null;
  const privateSeed = `${game}:${progression.mode}:${node ?? 0}:${seed}`;
  return {
    version: 1,
    seedId: digest(seed).slice(0, 12),
    mutationKey: digest(privateSeed).slice(0, 16),
    progressionMode: progression.mode,
    progressionNode: node,
    worldState: pick(privateSeed, "world", WORLD_STATES),
    missionFrame: pick(privateSeed, "mission", MISSION_FRAMES),
    pressureProfile: pick(privateSeed, "pressure", PRESSURE_PROFILES),
    objectiveModifier: pick(privateSeed, "objective", OBJECTIVE_MODIFIERS),
    encounterPattern: pick(privateSeed, "encounter", ENCOUNTER_PATTERNS),
    bonusCondition: pick(privateSeed, "bonus", BONUS_CONDITIONS),
    varietyFloor: ARCADE_SESSION_VARIETY_MIN,
  };
}
