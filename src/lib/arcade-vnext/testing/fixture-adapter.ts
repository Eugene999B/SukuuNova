import { z } from "zod";
import type { ArcadeGameAdapter } from "../adapter";

export const FIXTURE_GAME = "fixture-balance-lab";
export const FIXTURE_SCHEMA = "fixture.balance.v1";
export const FIXTURE_SECRET = "SERVER_ONLY_FIXTURE_SECRET";

const publicMissionSchema = z.object({
  title: z.literal("Balance the test tray"),
  slots: z.literal(3),
  allowedValues: z.array(z.number().int().min(1).max(4)).length(4),
}).strict();

const privateMissionSchema = z.object({
  targetSum: z.literal(6),
  secretMarker: z.literal(FIXTURE_SECRET),
}).strict();

const stateSchema = z.object({
  values: z.array(z.number().int().min(1).max(4).nullable()).length(3),
  attempts: z.number().int().nonnegative(),
}).strict();

const placeSchema = z.object({
  slot: z.number().int().min(0).max(2),
  value: z.number().int().min(1).max(4),
}).strict();

const clearSchema = z.object({
  slot: z.number().int().min(0).max(2),
}).strict();

const noteArtifactSchema = z.object({
  note: z.string().min(1).max(200),
}).strict();

type FixtureAction =
  | { kind: "place"; slot: number; value: number }
  | { kind: "clear"; slot: number };

export const fixtureArcadeAdapter: ArcadeGameAdapter = {
  game: FIXTURE_GAME,
  schema: FIXTURE_SCHEMA,
  publicMissionSchema,
  privateMissionSchema,
  stateSchema,

  createMission() {
    return {
      publicMission: {
        title: "Balance the test tray",
        slots: 3,
        allowedValues: [1, 2, 3, 4],
      },
      privateMission: {
        targetSum: 6,
        secretMarker: FIXTURE_SECRET,
      },
      initialState: { values: [null, null, null], attempts: 0 },
      skillTargets: ["fixture.balance"],
    };
  },

  parseAction(actionType, payload): FixtureAction {
    if (actionType === "place") return { kind: "place", ...placeSchema.parse(payload) };
    if (actionType === "clear") return { kind: "clear", ...clearSchema.parse(payload) };
    throw new z.ZodError([{ code: "custom", path: ["actionType"], message: "Unsupported fixture action." }]);
  },

  parseArtifact(artifactType, payload) {
    if (artifactType !== "note") {
      throw new z.ZodError([{ code: "custom", path: ["artifactType"], message: "Unsupported fixture artifact." }]);
    }
    return noteArtifactSchema.parse(payload);
  },

  applyAction({ publicMission, privateMission, state, action }) {
    publicMissionSchema.parse(publicMission);
    const hidden = privateMissionSchema.parse(privateMission);
    const current = stateSchema.parse(state);
    const parsed = action as FixtureAction;
    const values = [...current.values];
    if (parsed.kind === "place") values[parsed.slot] = parsed.value;
    else values[parsed.slot] = null;
    const next = stateSchema.parse({ values, attempts: current.attempts + 1 });
    const filled = values.filter((value): value is number => value !== null).length;
    const sum = values.reduce<number>((total, value) => total + (value ?? 0), 0);
    const demonstrated = filled === 3 && sum === hidden.targetSum;
    return {
      state: next,
      feedback: [{
        code: demonstrated ? "tray_balanced" : "tray_updated",
        severity: demonstrated ? "success" : "info",
        message: demonstrated ? "The tray is balanced." : "The tray changed. Keep testing your arrangement.",
        focus: "tray",
        data: { filled },
      }],
      evidence: [{
        skillKey: "fixture.balance",
        evidenceType: "state_change",
        outcome: demonstrated ? "demonstrated" : filled === 3 ? "not_yet" : "developing",
        confidence: demonstrated ? 1 : filled === 3 ? 0.6 : 0.35,
        context: { filled },
      }],
      terminal: demonstrated,
    };
  },

  grade({ privateMission, state, artifact }) {
    const hidden = privateMissionSchema.parse(privateMission);
    const current = stateSchema.parse(state);
    if (artifact !== undefined) noteArtifactSchema.parse(artifact);
    const complete = current.values.every((value) => value !== null);
    const sum = current.values.reduce<number>((total, value) => total + (value ?? 0), 0);
    const passed = complete && sum === hidden.targetSum;
    return {
      evidence: [{
        skillKey: "fixture.balance",
        evidenceType: "authoritative_grade",
        outcome: passed ? "demonstrated" : "not_yet",
        confidence: 1,
        context: { complete, attempts: current.attempts },
      }],
      summary: { score: passed ? 100 : 0, complete, attempts: current.attempts },
      rewards: { xp: 0 },
    };
  },

  serializePublicState(state) {
    return stateSchema.parse(state);
  },

  createSnapshot(state) {
    return stateSchema.parse(state);
  },

  restoreSnapshot(snapshot) {
    return stateSchema.parse(snapshot);
  },
};
