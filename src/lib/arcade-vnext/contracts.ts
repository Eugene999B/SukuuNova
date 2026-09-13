import { z } from "zod";

export const ARCADE_VNEXT_MAX_PAYLOAD_BYTES = 64 * 1024;

const identifier = z.string().min(1).max(96).regex(/^[a-z0-9][a-z0-9._-]*$/i);
const idempotencyKey = z.string().min(8).max(128);

export const arcadeFeedbackSchema = z.object({
  code: identifier,
  severity: z.enum(["info", "success", "warning", "error"]),
  message: z.string().min(1).max(500),
  focus: z.string().max(96).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const arcadeSkillEvidenceSchema = z.object({
  skillKey: identifier,
  evidenceType: identifier,
  outcome: z.enum(["demonstrated", "developing", "not_yet"]),
  confidence: z.number().min(0).max(1),
  misconception: z.string().max(240).optional(),
  artifactId: z.string().max(128).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type ArcadeFeedback = z.infer<typeof arcadeFeedbackSchema>;
export type ArcadeSkillEvidence = z.infer<typeof arcadeSkillEvidenceSchema>;
export type ArcadeSessionStatus = "active" | "completed" | "abandoned";

export type ArcadeAssessment = {
  evidence: ArcadeSkillEvidence[];
  summary: Record<string, unknown>;
  rewards: Record<string, unknown>;
};

export type ArcadeSessionEnvelope = {
  id: string;
  studentId: string;
  game: string;
  gameSchema: string;
  ageBand: string | null;
  status: ArcadeSessionStatus;
  sessionSequence: number;
  mission: unknown;
  state: unknown;
  skillTargets: string[];
  startedAt: string;
  completedAt: string | null;
  assessment?: ArcadeAssessment;
};

export const arcadeSessionStartSchema = z.object({
  studentId: z.string().min(1).max(128),
  game: identifier,
  gameSchema: identifier,
  ageBand: z.string().min(1).max(32).optional(),
}).strict();

export const arcadeActionRequestSchema = z.object({
  gameSchema: identifier,
  clientSequence: z.number().int().nonnegative(),
  expectedSessionSequence: z.number().int().nonnegative(),
  idempotencyKey,
  actionType: identifier,
  payload: z.unknown(),
}).strict();

export const arcadeArtifactRequestSchema = z.object({
  gameSchema: identifier,
  clientSequence: z.number().int().nonnegative(),
  expectedSessionSequence: z.number().int().nonnegative(),
  idempotencyKey,
  artifactType: identifier,
  payload: z.unknown(),
}).strict();

export const arcadeFinishRequestSchema = z.object({
  gameSchema: identifier,
  clientSequence: z.number().int().nonnegative(),
  expectedSessionSequence: z.number().int().nonnegative(),
  idempotencyKey,
}).strict();

export type ArcadeSessionStartInput = z.infer<typeof arcadeSessionStartSchema>;
export type ArcadeActionRequest = z.infer<typeof arcadeActionRequestSchema>;
export type ArcadeArtifactRequest = z.infer<typeof arcadeArtifactRequestSchema>;
export type ArcadeFinishRequest = z.infer<typeof arcadeFinishRequestSchema>;

export type ArcadeMutationResult = {
  session: ArcadeSessionEnvelope;
  feedback: ArcadeFeedback[];
  evidence: ArcadeSkillEvidence[];
  artifactId?: string;
};

/** A cheap, deterministic boundary check before untrusted JSON reaches a game adapter. */
export function arcadePayloadFitsBudget(value: unknown, maxBytes = ARCADE_VNEXT_MAX_PAYLOAD_BYTES) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return false;
    return new TextEncoder().encode(serialized).byteLength <= maxBytes;
  } catch {
    return false;
  }
}
