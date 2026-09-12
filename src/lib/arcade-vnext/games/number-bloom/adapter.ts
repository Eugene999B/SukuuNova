import type { ArcadeGameAdapter } from "../../adapter";
import {
  applyNumberBloomAction,
  evaluateNumberBloomState,
  numberBloomPrivateMissionSchema,
  numberBloomPublicMissionSchema,
  numberBloomStateSchema,
  parseNumberBloomAction,
  selectNumberBloomMission,
  type NumberBloomMechanic,
} from "./domain";

export const NUMBER_BLOOM_GAME = "number-bloom";
export const NUMBER_BLOOM_SCHEMA = "v1";

function skillFor(mechanic: NumberBloomMechanic) {
  if (mechanic === "plant_count") return "number_bloom.cardinality";
  if (mechanic === "make_bed") return "number_bloom.composition";
  if (mechanic === "compare_patches") return "number_bloom.comparison";
  return "number_bloom.free_play";
}

export const numberBloomArcadeAdapter: ArcadeGameAdapter = {
  game: NUMBER_BLOOM_GAME,
  schema: NUMBER_BLOOM_SCHEMA,
  publicMissionSchema: numberBloomPublicMissionSchema,
  privateMissionSchema: numberBloomPrivateMissionSchema,
  stateSchema: numberBloomStateSchema,

  createMission(ctx) {
    const mission = selectNumberBloomMission(ctx.studentId);
    return {
      ...mission,
      skillTargets: mission.publicMission.mechanic === "free_grow"
        ? []
        : [skillFor(mission.publicMission.mechanic)],
    };
  },

  parseAction(actionType, payload) {
    return parseNumberBloomAction(actionType, payload);
  },

  parseArtifact() {
    throw new Error("Number Bloom v1 does not accept graded artifacts; evidence comes from garden state and structured actions.");
  },

  applyAction({ publicMission, privateMission, state, action }) {
    const publicParsed = numberBloomPublicMissionSchema.parse(publicMission);
    const privateParsed = numberBloomPrivateMissionSchema.parse(privateMission);
    const current = numberBloomStateSchema.parse(state);
    const next = applyNumberBloomAction(publicParsed, current, action as ReturnType<typeof parseNumberBloomAction>);
    const evaluation = evaluateNumberBloomState(privateParsed, next);
    const skillKey = skillFor(publicParsed.mechanic);
    const ungraded = publicParsed.mechanic === "free_grow";

    return {
      state: next,
      feedback: [{
        code: ungraded
          ? "garden_changed"
          : evaluation.demonstrated
            ? "garden_relationship_demonstrated"
            : "garden_changed",
        severity: evaluation.demonstrated ? "success" : "info",
        message: evaluation.demonstrated
          ? "The garden shows the number relationship."
          : "The garden changed. You can keep moving things.",
        focus: publicParsed.mechanic,
        data: { progress: evaluation.progress },
      }],
      evidence: ungraded ? [] : [{
        skillKey,
        evidenceType: "direct_manipulation_state",
        outcome: evaluation.demonstrated ? "demonstrated" : "developing",
        confidence: evaluation.demonstrated ? 0.95 : Math.max(0.2, Math.min(0.8, evaluation.progress)),
        misconception: evaluation.misconception,
        context: {
          ...evaluation.context,
          selfCorrections: next.selfCorrections,
          supportRequests: next.supportRequests,
        },
      }],
      terminal: ungraded ? false : evaluation.demonstrated,
    };
  },

  grade({ publicMission, privateMission, state }) {
    const publicParsed = numberBloomPublicMissionSchema.parse(publicMission);
    const privateParsed = numberBloomPrivateMissionSchema.parse(privateMission);
    const current = numberBloomStateSchema.parse(state);
    const evaluation = evaluateNumberBloomState(privateParsed, current);
    const ungraded = publicParsed.mechanic === "free_grow";

    if (ungraded) {
      return {
        evidence: [],
        summary: {
          ungraded: true,
          interactions: current.interactionCount,
          selfCorrections: current.selfCorrections,
          supportRequests: current.supportRequests,
        },
        rewards: {},
      };
    }

    return {
      evidence: [{
        skillKey: skillFor(publicParsed.mechanic),
        evidenceType: "authoritative_garden_state",
        outcome: evaluation.demonstrated ? "demonstrated" : "not_yet",
        confidence: 1,
        misconception: evaluation.misconception,
        context: {
          ...evaluation.context,
          interactions: current.interactionCount,
          selfCorrections: current.selfCorrections,
          supportRequests: current.supportRequests,
        },
      }],
      summary: {
        demonstrated: evaluation.demonstrated,
        mechanic: publicParsed.mechanic,
        interactions: current.interactionCount,
        selfCorrections: current.selfCorrections,
        supportRequests: current.supportRequests,
      },
      rewards: {},
    };
  },

  serializePublicState(state) {
    return numberBloomStateSchema.parse(state);
  },

  createSnapshot(state) {
    return numberBloomStateSchema.parse(state);
  },

  restoreSnapshot(snapshot) {
    return numberBloomStateSchema.parse(snapshot);
  },
};
