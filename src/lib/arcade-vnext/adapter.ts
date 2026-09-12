import type { z } from "zod";
import { AppError } from "../errors";
import type { ArcadeFeedback, ArcadeSkillEvidence } from "./contracts";

export type Awaitable<T> = T | Promise<T>;

export class ArcadeActionRejectedError extends AppError {
  constructor(message = "The game action was rejected.") {
    super(message, 400, "ARCADE_ACTION_INVALID");
    this.name = "ArcadeActionRejectedError";
  }
}

export type ArcadeAdapterContext = {
  schoolId: string;
  studentId: string;
  ageBand: string | null;
  now: Date;
};

export type ArcadeMissionBundle = {
  publicMission: unknown;
  privateMission: unknown;
  initialState: unknown;
  skillTargets: string[];
};

export type ArcadeActionApplication = {
  state: unknown;
  feedback: ArcadeFeedback[];
  evidence: ArcadeSkillEvidence[];
  terminal?: boolean;
};

export type ArcadeGradeResult = {
  evidence: ArcadeSkillEvidence[];
  summary: Record<string, unknown>;
  rewards: Record<string, unknown>;
};

/**
 * Runtime boundary between the Arcade platform and a mechanically unique game.
 * The platform deliberately knows nothing about question cards, answers or HUDs.
 * State-dependent client mistakes should throw ArcadeActionRejectedError so they
 * fail as safe 400 responses without masking unexpected adapter defects.
 */
export interface ArcadeGameAdapter {
  readonly game: string;
  readonly schema: string;
  readonly publicMissionSchema: z.ZodType<unknown>;
  readonly privateMissionSchema: z.ZodType<unknown>;
  readonly stateSchema: z.ZodType<unknown>;

  createMission(ctx: ArcadeAdapterContext): Awaitable<ArcadeMissionBundle>;
  parseAction(actionType: string, payload: unknown): unknown;
  parseArtifact(artifactType: string, payload: unknown): unknown;
  applyAction(input: {
    publicMission: unknown;
    privateMission: unknown;
    state: unknown;
    action: unknown;
    ctx: ArcadeAdapterContext;
  }): Awaitable<ArcadeActionApplication>;
  grade(input: {
    publicMission: unknown;
    privateMission: unknown;
    state: unknown;
    artifact?: unknown;
    events: readonly unknown[];
    ctx: ArcadeAdapterContext;
  }): Awaitable<ArcadeGradeResult>;
  serializePublicState(state: unknown): unknown;
  createSnapshot(state: unknown): unknown;
  restoreSnapshot(snapshot: unknown): unknown;
}
