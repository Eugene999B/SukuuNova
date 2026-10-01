import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { z, ZodError } from "zod";
import type { TenantDb } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import type { ArcadeGameAdapter } from "./adapter";
import {
  arcadeActionRequestSchema,
  arcadeArtifactRequestSchema,
  arcadeFeedbackSchema,
  arcadeFinishRequestSchema,
  arcadePayloadFitsBudget,
  arcadeSessionStartSchema,
  arcadeSkillEvidenceSchema,
  type ArcadeActionRequest,
  type ArcadeArtifactRequest,
  type ArcadeAssessment,
  type ArcadeFinishRequest,
  type ArcadeMutationResult,
  type ArcadeSessionEnvelope,
  type ArcadeSessionStartInput,
} from "./contracts";
import { ArcadeAdapterRegistry, arcadeAdapterRegistry } from "./registry";
import { ArcadeSessionConflictError } from "./session-errors";

export type ArcadeGuardianContext = {
  schoolId: string;
  guardianId: string;
  userId: string;
};

type SessionRow = {
  id: string;
  schoolId: string;
  studentId: string;
  game: string;
  gameSchema: string;
  ageBand: string | null;
  status: string;
  publicMission: unknown;
  privateMission: unknown;
  currentState: unknown;
  skillTargets: unknown;
  currentSequence: number;
  startedAt: Date;
  lastActiveAt: Date;
  completedAt: Date | null;
};

type StoredEventRow = {
  requestFingerprint: string;
  response: unknown;
};

type AssessmentRow = {
  evidence: unknown;
  summary: unknown;
  rewards: unknown;
};

type EventForGrade = {
  sequence: number;
  kind: string;
  actionType: string;
  payload: unknown;
};

type ArtifactRow = { payload: unknown };

const skillTargetsSchema = z.array(z.string().min(1).max(96)).max(128);
const sessionStatusSchema = z.enum(["active", "completed", "abandoned"]);
const MAX_ADAPTER_JSON_BYTES = 256 * 1024;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AppError("Arcade payload must contain finite JSON numbers.", 400, "ARCADE_PAYLOAD_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  throw new AppError("Arcade payload must be JSON serializable.", 400, "ARCADE_PAYLOAD_INVALID");
}

function jsonForStorage(value: unknown, source: "client" | "adapter") {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new AppError(
      source === "client" ? "Arcade payload must be JSON serializable." : "The Arcade adapter produced non-JSON state.",
      source === "client" ? 400 : 500,
      source === "client" ? "ARCADE_PAYLOAD_INVALID" : "ARCADE_ADAPTER_INVALID",
    );
  }
  if (serialized === undefined) {
    throw new AppError(
      source === "client" ? "Arcade payload must be JSON serializable." : "The Arcade adapter produced empty non-JSON state.",
      source === "client" ? 400 : 500,
      source === "client" ? "ARCADE_PAYLOAD_INVALID" : "ARCADE_ADAPTER_INVALID",
    );
  }
  const max = source === "client" ? undefined : MAX_ADAPTER_JSON_BYTES;
  if (max !== undefined && !arcadePayloadFitsBudget(value, max)) {
    throw new AppError("The Arcade adapter produced state beyond the platform budget.", 500, "ARCADE_ADAPTER_INVALID");
  }
  return serialized;
}

function assertClientPayload(payload: unknown) {
  if (!arcadePayloadFitsBudget(payload)) {
    throw new AppError("Arcade action payload is too large or not valid JSON.", 413, "ARCADE_PAYLOAD_TOO_LARGE");
  }
}

function requestFingerprint(kind: string, request: object) {
  return createHash("sha256").update(canonicalJson({ kind, request })).digest("hex");
}

async function requireCurrentGuardian(tx: TenantDb, context: ArcadeGuardianContext) {
  const guardian = await tx.guardian.findFirst({
    where: { id: context.guardianId, schoolId: context.schoolId, userId: context.userId },
    select: { id: true },
  });
  if (!guardian) throw new ForbiddenError("This guardian account is no longer linked.");
}

async function requireLinkedChild(tx: TenantDb, context: ArcadeGuardianContext, studentId: string) {
  await requireCurrentGuardian(tx, context);
  const child = await tx.student.findFirst({
    where: {
      id: studentId,
      schoolId: context.schoolId,
      status: "active",
      guardians: { some: { guardianId: context.guardianId, schoolId: context.schoolId } },
    },
    select: { id: true },
  });
  if (!child) throw new ForbiddenError("Choose an active child linked to your guardian account.");
}

async function loadSession(tx: TenantDb, context: ArcadeGuardianContext, sessionId: string) {
  const rows = await tx.$queryRaw<SessionRow[]>`
    SELECT "id","schoolId","studentId","game","gameSchema","ageBand","status",
           "publicMission","privateMission","currentState","skillTargets","currentSequence",
           "startedAt","lastActiveAt","completedAt"
      FROM "ArcadeGameSession"
     WHERE "id"=${sessionId} AND "schoolId"=${context.schoolId}
     LIMIT 1`;
  const row = rows[0];
  if (!row) throw new NotFoundError("Arcade session not found.");
  await requireLinkedChild(tx, context, row.studentId);
  return row;
}

function adapterState(row: SessionRow, registry: ArcadeAdapterRegistry) {
  const adapter = registry.require(row.game, row.gameSchema);
  const publicMission = adapter.publicMissionSchema.parse(row.publicMission);
  const privateMission = adapter.privateMissionSchema.parse(row.privateMission);
  const state = adapter.stateSchema.parse(row.currentState);
  const skillTargets = skillTargetsSchema.parse(row.skillTargets);
  const status = sessionStatusSchema.parse(row.status);
  return { adapter, publicMission, privateMission, state, skillTargets, status };
}

async function loadAssessment(tx: TenantDb, sessionId: string): Promise<ArcadeAssessment | undefined> {
  const rows = await tx.$queryRaw<AssessmentRow[]>`
    SELECT "evidence","summary","rewards" FROM "ArcadeGameAssessment"
     WHERE "sessionId"=${sessionId} LIMIT 1`;
  if (!rows[0]) return undefined;
  return {
    evidence: z.array(arcadeSkillEvidenceSchema).parse(rows[0].evidence),
    summary: z.record(z.string(), z.unknown()).parse(rows[0].summary),
    rewards: z.record(z.string(), z.unknown()).parse(rows[0].rewards),
  };
}

function envelopeFrom(
  row: SessionRow,
  adapter: ArcadeGameAdapter,
  skillTargets: string[],
  status: "active" | "completed" | "abandoned",
  assessment?: ArcadeAssessment,
): ArcadeSessionEnvelope {
  const envelope: ArcadeSessionEnvelope = {
    id: row.id,
    studentId: row.studentId,
    game: row.game,
    gameSchema: row.gameSchema,
    ageBand: row.ageBand,
    status,
    sessionSequence: row.currentSequence,
    mission: adapter.publicMissionSchema.parse(row.publicMission),
    state: adapter.serializePublicState(adapter.stateSchema.parse(row.currentState)),
    skillTargets,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
  if (assessment) envelope.assessment = assessment;
  return envelope;
}

async function safeEnvelope(
  tx: TenantDb,
  row: SessionRow,
  registry: ArcadeAdapterRegistry,
): Promise<ArcadeSessionEnvelope> {
  const parsed = adapterState(row, registry);
  const assessment = parsed.status === "completed" ? await loadAssessment(tx, row.id) : undefined;
  return envelopeFrom(row, parsed.adapter, parsed.skillTargets, parsed.status, assessment);
}

function normalizeAdapterInput<T>(work: () => T, code: string, message: string): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof ZodError || error instanceof AppError) throw new AppError(message, 400, code);
    throw error;
  }
}

function validateAdapterOutput<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof ZodError) throw new AppError("Arcade adapter output violated its pinned schema.", 500, "ARCADE_ADAPTER_INVALID");
    throw error;
  }
}

async function duplicateEvent(tx: TenantDb, sessionId: string, idempotencyKey: string) {
  const rows = await tx.$queryRaw<StoredEventRow[]>`
    SELECT "requestFingerprint","response" FROM "ArcadeGameEvent"
     WHERE "sessionId"=${sessionId} AND "idempotencyKey"=${idempotencyKey}
     LIMIT 1`;
  return rows[0];
}

function duplicateResult(
  stored: StoredEventRow | undefined,
  fingerprint: string,
  authoritative: ArcadeSessionEnvelope,
): ArcadeMutationResult | undefined {
  if (!stored) return undefined;
  if (stored.requestFingerprint !== fingerprint) {
    throw new ArcadeSessionConflictError(
      "IDEMPOTENCY_KEY_REUSED",
      "That idempotency key was already used for a different Arcade mutation.",
      authoritative,
    );
  }
  return stored.response as ArcadeMutationResult;
}

function assertPinnedSchema(row: SessionRow, gameSchema: string, authoritative: ArcadeSessionEnvelope) {
  if (row.gameSchema !== gameSchema) {
    throw new ArcadeSessionConflictError(
      "ARCADE_SCHEMA_MISMATCH",
      "This session is pinned to a different Arcade game schema.",
      authoritative,
    );
  }
}

function assertMutable(row: SessionRow, authoritative: ArcadeSessionEnvelope) {
  if (row.status !== "active") {
    throw new ArcadeSessionConflictError(
      "SESSION_COMPLETED",
      "This Arcade session is already closed and cannot be changed.",
      authoritative,
    );
  }
}

function assertExpectedSequence(row: SessionRow, expected: number, authoritative: ArcadeSessionEnvelope) {
  if (row.currentSequence !== expected) {
    throw new ArcadeSessionConflictError(
      "SESSION_OUT_OF_DATE",
      "This Arcade session changed in another tab or request.",
      authoritative,
    );
  }
}

async function conflictAfterLostRace(
  tx: TenantDb,
  context: ArcadeGuardianContext,
  sessionId: string,
  idempotencyKey: string,
  fingerprint: string,
  registry: ArcadeAdapterRegistry,
) {
  const duplicate = await duplicateEvent(tx, sessionId, idempotencyKey);
  const fresh = await loadSession(tx, context, sessionId);
  const authoritative = await safeEnvelope(tx, fresh, registry);
  const retried = duplicateResult(duplicate, fingerprint, authoritative);
  if (retried) return retried;
  throw new ArcadeSessionConflictError(
    "SESSION_OUT_OF_DATE",
    "This Arcade session changed in another tab or request.",
    authoritative,
  );
}

export async function startArcadeVNextSession(
  tx: TenantDb,
  context: ArcadeGuardianContext,
  rawInput: ArcadeSessionStartInput,
  registry: ArcadeAdapterRegistry = arcadeAdapterRegistry,
): Promise<ArcadeSessionEnvelope> {
  const input = arcadeSessionStartSchema.parse(rawInput);
  await requireLinkedChild(tx, context, input.studentId);
  const adapter = registry.require(input.game, input.gameSchema);
  const now = new Date();
  const adapterContext = { schoolId: context.schoolId, studentId: input.studentId, ageBand: input.ageBand ?? null, now };
  const mission = await adapter.createMission(adapterContext);
  const publicMission = validateAdapterOutput(() => adapter.publicMissionSchema.parse(mission.publicMission));
  const privateMission = validateAdapterOutput(() => adapter.privateMissionSchema.parse(mission.privateMission));
  const state = validateAdapterOutput(() => adapter.stateSchema.parse(mission.initialState));
  const skillTargets = validateAdapterOutput(() => skillTargetsSchema.parse(mission.skillTargets));
  const snapshot = validateAdapterOutput(() => adapter.createSnapshot(state));
  const id = createId();
  const snapshotId = createId();
  const publicJson = jsonForStorage(publicMission, "adapter");
  const privateJson = jsonForStorage(privateMission, "adapter");
  const stateJson = jsonForStorage(state, "adapter");
  const targetsJson = jsonForStorage(skillTargets, "adapter");
  const snapshotJson = jsonForStorage(snapshot, "adapter");

  await tx.$executeRaw`
    INSERT INTO "ArcadeGameSession"
      ("id","schoolId","studentId","game","gameSchema","ageBand","status","publicMission","privateMission","currentState","skillTargets","currentSequence","startedAt","lastActiveAt")
    VALUES
      (${id},${context.schoolId},${input.studentId},${input.game},${input.gameSchema},${input.ageBand ?? null},'active',
       CAST(${publicJson} AS jsonb),CAST(${privateJson} AS jsonb),CAST(${stateJson} AS jsonb),CAST(${targetsJson} AS jsonb),0,${now},${now})`;
  await tx.$executeRaw`
    INSERT INTO "ArcadeGameSnapshot" ("id","schoolId","sessionId","sequence","gameSchema","state")
    VALUES (${snapshotId},${context.schoolId},${id},0,${input.gameSchema},CAST(${snapshotJson} AS jsonb))`;

  return {
    id,
    studentId: input.studentId,
    game: input.game,
    gameSchema: input.gameSchema,
    ageBand: input.ageBand ?? null,
    status: "active",
    sessionSequence: 0,
    mission: publicMission,
    state: adapter.serializePublicState(state),
    skillTargets,
    startedAt: now.toISOString(),
    completedAt: null,
  };
}

export async function readArcadeVNextSession(
  tx: TenantDb,
  context: ArcadeGuardianContext,
  sessionId: string,
  registry: ArcadeAdapterRegistry = arcadeAdapterRegistry,
) {
  const row = await loadSession(tx, context, sessionId);
  return safeEnvelope(tx, row, registry);
}

export async function applyArcadeVNextAction(
  tx: TenantDb,
  context: ArcadeGuardianContext,
  sessionId: string,
  rawRequest: ArcadeActionRequest,
  registry: ArcadeAdapterRegistry = arcadeAdapterRegistry,
): Promise<ArcadeMutationResult> {
  const request = arcadeActionRequestSchema.parse(rawRequest);
  assertClientPayload(request.payload);
  const fingerprint = requestFingerprint("action", request);
  const row = await loadSession(tx, context, sessionId);
  const parsed = adapterState(row, registry);
  const authoritative = await safeEnvelope(tx, row, registry);
  assertPinnedSchema(row, request.gameSchema, authoritative);
  const stored = await duplicateEvent(tx, sessionId, request.idempotencyKey);
  const prior = duplicateResult(stored, fingerprint, authoritative);
  if (prior) return prior;
  assertMutable(row, authoritative);
  assertExpectedSequence(row, request.expectedSessionSequence, authoritative);

  const action = normalizeAdapterInput(
    () => parsed.adapter.parseAction(request.actionType, request.payload),
    "ARCADE_ACTION_INVALID",
    "The game action was rejected.",
  );
  const application = await parsed.adapter.applyAction({
    publicMission: parsed.publicMission,
    privateMission: parsed.privateMission,
    state: parsed.state,
    action,
    ctx: { schoolId: context.schoolId, studentId: row.studentId, ageBand: row.ageBand, now: new Date() },
  });
  const nextState = validateAdapterOutput(() => parsed.adapter.stateSchema.parse(application.state));
  const feedback = validateAdapterOutput(() => z.array(arcadeFeedbackSchema).max(32).parse(application.feedback));
  const evidence = validateAdapterOutput(() => z.array(arcadeSkillEvidenceSchema).max(64).parse(application.evidence));
  const snapshot = validateAdapterOutput(() => parsed.adapter.createSnapshot(nextState));
  const nextSequence = row.currentSequence + 1;
  const stateJson = jsonForStorage(nextState, "adapter");
  const snapshotJson = jsonForStorage(snapshot, "adapter");
  const now = new Date();
  const updated = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "ArcadeGameSession"
       SET "currentState"=CAST(${stateJson} AS jsonb),"currentSequence"=${nextSequence},"lastActiveAt"=${now}
     WHERE "id"=${sessionId} AND "schoolId"=${context.schoolId} AND "status"='active' AND "currentSequence"=${row.currentSequence}
     RETURNING "id"`;
  if (updated.length !== 1) {
    return conflictAfterLostRace(tx, context, sessionId, request.idempotencyKey, fingerprint, registry);
  }

  const nextRow: SessionRow = { ...row, currentState: nextState, currentSequence: nextSequence, lastActiveAt: now };
  const session = envelopeFrom(nextRow, parsed.adapter, parsed.skillTargets, "active");
  const result: ArcadeMutationResult = { session, feedback, evidence };
  await tx.$executeRaw`
    INSERT INTO "ArcadeGameEvent"
      ("id","schoolId","sessionId","sequence","clientSequence","idempotencyKey","requestFingerprint","kind","actionType","payload","response")
    VALUES
      (${createId()},${context.schoolId},${sessionId},${nextSequence},${request.clientSequence},${request.idempotencyKey},${fingerprint},'action',${request.actionType},
       CAST(${jsonForStorage(request.payload, "client")} AS jsonb),CAST(${jsonForStorage(result, "adapter")} AS jsonb))`;
  await tx.$executeRaw`
    INSERT INTO "ArcadeGameSnapshot" ("id","schoolId","sessionId","sequence","gameSchema","state")
    VALUES (${createId()},${context.schoolId},${sessionId},${nextSequence},${row.gameSchema},CAST(${snapshotJson} AS jsonb))`;
  return result;
}

export async function submitArcadeVNextArtifact(
  tx: TenantDb,
  context: ArcadeGuardianContext,
  sessionId: string,
  rawRequest: ArcadeArtifactRequest,
  registry: ArcadeAdapterRegistry = arcadeAdapterRegistry,
): Promise<ArcadeMutationResult> {
  const request = arcadeArtifactRequestSchema.parse(rawRequest);
  assertClientPayload(request.payload);
  const fingerprint = requestFingerprint("artifact", request);
  const row = await loadSession(tx, context, sessionId);
  const parsed = adapterState(row, registry);
  const authoritative = await safeEnvelope(tx, row, registry);
  assertPinnedSchema(row, request.gameSchema, authoritative);
  const stored = await duplicateEvent(tx, sessionId, request.idempotencyKey);
  const prior = duplicateResult(stored, fingerprint, authoritative);
  if (prior) return prior;
  assertMutable(row, authoritative);
  assertExpectedSequence(row, request.expectedSessionSequence, authoritative);

  const artifact = normalizeAdapterInput(
    () => parsed.adapter.parseArtifact(request.artifactType, request.payload),
    "ARCADE_ARTIFACT_INVALID",
    "The game artifact was rejected.",
  );
  const artifactJson = jsonForStorage(artifact, "adapter");
  const nextSequence = row.currentSequence + 1;
  const now = new Date();
  const updated = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "ArcadeGameSession"
       SET "currentSequence"=${nextSequence},"lastActiveAt"=${now}
     WHERE "id"=${sessionId} AND "schoolId"=${context.schoolId} AND "status"='active' AND "currentSequence"=${row.currentSequence}
     RETURNING "id"`;
  if (updated.length !== 1) {
    return conflictAfterLostRace(tx, context, sessionId, request.idempotencyKey, fingerprint, registry);
  }

  const artifactId = createId();
  const nextRow: SessionRow = { ...row, currentSequence: nextSequence, lastActiveAt: now };
  const session = envelopeFrom(nextRow, parsed.adapter, parsed.skillTargets, "active");
  const result: ArcadeMutationResult = { session, feedback: [], evidence: [], artifactId };
  await tx.$executeRaw`
    INSERT INTO "ArcadeGameArtifact" ("id","schoolId","sessionId","sequence","artifactType","payload")
    VALUES (${artifactId},${context.schoolId},${sessionId},${nextSequence},${request.artifactType},CAST(${artifactJson} AS jsonb))`;
  await tx.$executeRaw`
    INSERT INTO "ArcadeGameEvent"
      ("id","schoolId","sessionId","sequence","clientSequence","idempotencyKey","requestFingerprint","kind","actionType","payload","response")
    VALUES
      (${createId()},${context.schoolId},${sessionId},${nextSequence},${request.clientSequence},${request.idempotencyKey},${fingerprint},'artifact',${request.artifactType},
       CAST(${jsonForStorage(request.payload, "client")} AS jsonb),CAST(${jsonForStorage(result, "adapter")} AS jsonb))`;
  await tx.$executeRaw`
    INSERT INTO "ArcadeGameSnapshot" ("id","schoolId","sessionId","sequence","gameSchema","state")
    VALUES (${createId()},${context.schoolId},${sessionId},${nextSequence},${row.gameSchema},CAST(${jsonForStorage(parsed.adapter.createSnapshot(parsed.state), "adapter")} AS jsonb))`;
  return result;
}

export async function finishArcadeVNextSession(
  tx: TenantDb,
  context: ArcadeGuardianContext,
  sessionId: string,
  rawRequest: ArcadeFinishRequest,
  registry: ArcadeAdapterRegistry = arcadeAdapterRegistry,
): Promise<ArcadeMutationResult> {
  const request = arcadeFinishRequestSchema.parse(rawRequest);
  const fingerprint = requestFingerprint("finish", request);
  const row = await loadSession(tx, context, sessionId);
  const parsed = adapterState(row, registry);
  const authoritative = await safeEnvelope(tx, row, registry);
  assertPinnedSchema(row, request.gameSchema, authoritative);
  const stored = await duplicateEvent(tx, sessionId, request.idempotencyKey);
  const prior = duplicateResult(stored, fingerprint, authoritative);
  if (prior) return prior;
  assertMutable(row, authoritative);
  assertExpectedSequence(row, request.expectedSessionSequence, authoritative);

  const events = await tx.$queryRaw<EventForGrade[]>`
    SELECT "sequence","kind","actionType","payload" FROM "ArcadeGameEvent"
     WHERE "sessionId"=${sessionId} ORDER BY "sequence" ASC`;
  const artifactRows = await tx.$queryRaw<ArtifactRow[]>`
    SELECT "payload" FROM "ArcadeGameArtifact"
     WHERE "sessionId"=${sessionId} ORDER BY "sequence" DESC LIMIT 1`;
  const grade = await parsed.adapter.grade({
    publicMission: parsed.publicMission,
    privateMission: parsed.privateMission,
    state: parsed.state,
    artifact: artifactRows[0]?.payload,
    events,
    ctx: { schoolId: context.schoolId, studentId: row.studentId, ageBand: row.ageBand, now: new Date() },
  });
  const assessment: ArcadeAssessment = {
    evidence: validateAdapterOutput(() => z.array(arcadeSkillEvidenceSchema).max(128).parse(grade.evidence)),
    summary: validateAdapterOutput(() => z.record(z.string(), z.unknown()).parse(grade.summary)),
    rewards: validateAdapterOutput(() => z.record(z.string(), z.unknown()).parse(grade.rewards)),
  };
  const nextSequence = row.currentSequence + 1;
  const completedAt = new Date();
  const updated = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "ArcadeGameSession"
       SET "status"='completed',"currentSequence"=${nextSequence},"lastActiveAt"=${completedAt},"completedAt"=${completedAt}
     WHERE "id"=${sessionId} AND "schoolId"=${context.schoolId} AND "status"='active' AND "currentSequence"=${row.currentSequence}
     RETURNING "id"`;
  if (updated.length !== 1) {
    return conflictAfterLostRace(tx, context, sessionId, request.idempotencyKey, fingerprint, registry);
  }

  await tx.$executeRaw`
    INSERT INTO "ArcadeGameAssessment" ("id","schoolId","sessionId","gameSchema","evidence","summary","rewards")
    VALUES (${createId()},${context.schoolId},${sessionId},${row.gameSchema},CAST(${jsonForStorage(assessment.evidence, "adapter")} AS jsonb),
            CAST(${jsonForStorage(assessment.summary, "adapter")} AS jsonb),CAST(${jsonForStorage(assessment.rewards, "adapter")} AS jsonb))`;
  const nextRow: SessionRow = { ...row, status: "completed", currentSequence: nextSequence, completedAt, lastActiveAt: completedAt };
  const session = envelopeFrom(nextRow, parsed.adapter, parsed.skillTargets, "completed", assessment);
  const result: ArcadeMutationResult = { session, feedback: [], evidence: assessment.evidence };
  await tx.$executeRaw`
    INSERT INTO "ArcadeGameEvent"
      ("id","schoolId","sessionId","sequence","clientSequence","idempotencyKey","requestFingerprint","kind","actionType","payload","response")
    VALUES
      (${createId()},${context.schoolId},${sessionId},${nextSequence},${request.clientSequence},${request.idempotencyKey},${fingerprint},'finish','finish',
       CAST('null' AS jsonb),CAST(${jsonForStorage(result, "adapter")} AS jsonb))`;
  await tx.$executeRaw`
    INSERT INTO "ArcadeGameSnapshot" ("id","schoolId","sessionId","sequence","gameSchema","state")
    VALUES (${createId()},${context.schoolId},${sessionId},${nextSequence},${row.gameSchema},CAST(${jsonForStorage(parsed.adapter.createSnapshot(parsed.state), "adapter")} AS jsonb))`;
  return result;
}
