import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { NOVACORE_ALGORITHMS, type NovaCoreAlgorithm } from "./registry";

const MAX_OUTPUT_BYTES = 16_384;
const MAX_REASON_CODES = 32;
const MAX_REASON_CODE_LENGTH = 80;
const MAX_ENTITY_LENGTH = 160;
const MAX_SHADOW_KEY_LENGTH = 200;

export type NovaCoreDecisionInput = {
  schoolId: string;
  algorithmKey: string;
  entityType?: string | null;
  entityId?: string | null;
  inputFingerprint?: string | null;
  confidence?: number | null;
  reasonCodes?: string[];
  outputSummary?: unknown;
  shadowGroupKey?: string | null;
  latencyMs?: number | null;
};

export type PreparedNovaCoreDecision = {
  id: string;
  schoolId: string;
  algorithm: NovaCoreAlgorithm;
  entityType: string | null;
  entityId: string | null;
  inputFingerprint: string | null;
  confidence: number | null;
  reasonCodes: string[];
  outputSummary: Record<string, unknown> | unknown[];
  shadowGroupKey: string | null;
  latencyMs: number | null;
};

function normalizeString(value: string | null | undefined, max: number) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, max) : null;
}

function algorithmForKey(key: string) {
  const algorithm = NOVACORE_ALGORITHMS.find((item) => item.key === key);
  if (!algorithm) throw new AppError(`Unknown NovaCore algorithm key: ${key}`, 400, "NOVACORE_ALGORITHM_UNKNOWN");
  return algorithm;
}

function canonical(value: unknown, depth = 0): unknown {
  if (depth > 20) throw new Error("NovaCore fingerprint input is too deeply nested.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => canonical(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined && typeof item !== "function" && typeof item !== "symbol")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item, depth + 1)]),
    );
  }
  return String(value);
}

export function fingerprintNovaCoreInput(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex");
}

function safeOutput(value: unknown): Record<string, unknown> | unknown[] {
  const candidate = value === undefined ? {} : canonical(value);
  const output = Array.isArray(candidate)
    ? candidate
    : candidate && typeof candidate === "object"
      ? candidate as Record<string, unknown>
      : { value: candidate };
  const encoded = JSON.stringify(output);
  if (Buffer.byteLength(encoded, "utf8") > MAX_OUTPUT_BYTES) {
    throw new AppError("NovaCore output summary is too large for the decision ledger.", 400, "NOVACORE_OUTPUT_TOO_LARGE");
  }
  return output;
}

function safeReasons(reasons: string[] | undefined) {
  return [...new Set((reasons ?? [])
    .map((reason) => reason.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_"))
    .filter(Boolean)
    .map((reason) => reason.slice(0, MAX_REASON_CODE_LENGTH)))]
    .slice(0, MAX_REASON_CODES);
}

export function prepareNovaCoreDecision(input: NovaCoreDecisionInput): PreparedNovaCoreDecision {
  if (!input.schoolId.trim()) throw new AppError("schoolId is required for NovaCore telemetry.", 400, "NOVACORE_SCHOOL_REQUIRED");
  const algorithm = algorithmForKey(input.algorithmKey);
  const fingerprint = normalizeString(input.inputFingerprint, 64);
  if (fingerprint && !/^[a-f0-9]{64}$/i.test(fingerprint)) {
    throw new AppError("NovaCore input fingerprint must be a SHA-256 hex digest.", 400, "NOVACORE_FINGERPRINT_INVALID");
  }
  const confidence = input.confidence == null ? null : Number(input.confidence);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new AppError("NovaCore confidence must be between 0 and 1.", 400, "NOVACORE_CONFIDENCE_INVALID");
  }
  const latencyMs = input.latencyMs == null ? null : Math.floor(Number(input.latencyMs));
  if (latencyMs !== null && (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 3_600_000)) {
    throw new AppError("NovaCore latency is outside the accepted range.", 400, "NOVACORE_LATENCY_INVALID");
  }
  return {
    id: createId(),
    schoolId: input.schoolId,
    algorithm,
    entityType: normalizeString(input.entityType, MAX_ENTITY_LENGTH),
    entityId: normalizeString(input.entityId, MAX_ENTITY_LENGTH),
    inputFingerprint: fingerprint?.toLowerCase() ?? null,
    confidence,
    reasonCodes: safeReasons(input.reasonCodes),
    outputSummary: safeOutput(input.outputSummary),
    shadowGroupKey: normalizeString(input.shadowGroupKey, MAX_SHADOW_KEY_LENGTH),
    latencyMs,
  };
}

export async function recordNovaCoreDecision(tx: TenantDb, input: NovaCoreDecisionInput) {
  const row = prepareNovaCoreDecision(input);
  await tx.$executeRawUnsafe(
    `INSERT INTO "NovaCoreDecision"
      ("id","schoolId","algorithmKey","algorithmVersion","domain","rolloutMode","entityType","entityId","inputFingerprint","confidence","reasonCodes","outputSummary","shadowGroupKey","latencyMs")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14)`,
    row.id,
    row.schoolId,
    row.algorithm.key,
    row.algorithm.version,
    row.algorithm.domain,
    row.algorithm.rolloutMode,
    row.entityType,
    row.entityId,
    row.inputFingerprint,
    row.confidence,
    JSON.stringify(row.reasonCodes),
    JSON.stringify(row.outputSummary),
    row.shadowGroupKey,
    row.latencyMs,
  );
  return {
    id: row.id,
    algorithmKey: row.algorithm.key,
    algorithmVersion: row.algorithm.version,
    rolloutMode: row.algorithm.rolloutMode,
  };
}

export async function listNovaCoreDecisionEvidence(tx: TenantDb, input: {
  schoolId: string;
  algorithmKey?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
  const algorithmKey = normalizeString(input.algorithmKey, 160);
  if (algorithmKey) algorithmForKey(algorithmKey);
  const entityType = normalizeString(input.entityType, MAX_ENTITY_LENGTH);
  const entityId = normalizeString(input.entityId, MAX_ENTITY_LENGTH);
  return tx.$queryRawUnsafe<Array<{
    id: string;
    algorithmKey: string;
    algorithmVersion: string;
    domain: string;
    rolloutMode: string;
    entityType: string | null;
    entityId: string | null;
    inputFingerprint: string | null;
    confidence: string | null;
    reasonCodes: unknown;
    outputSummary: unknown;
    shadowGroupKey: string | null;
    latencyMs: number | null;
    createdAt: Date;
  }>>(
    `SELECT "id","algorithmKey","algorithmVersion","domain","rolloutMode","entityType","entityId","inputFingerprint",
            "confidence"::text,"reasonCodes","outputSummary","shadowGroupKey","latencyMs","createdAt"
     FROM "NovaCoreDecision"
     WHERE "schoolId"=$1
       AND ($2::text IS NULL OR "algorithmKey"=$2)
       AND ($3::text IS NULL OR "entityType"=$3)
       AND ($4::text IS NULL OR "entityId"=$4)
     ORDER BY "createdAt" DESC
     LIMIT $5`,
    input.schoolId,
    algorithmKey,
    entityType,
    entityId,
    limit,
  );
}
