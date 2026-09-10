import { createId } from "@paralleldrive/cuid2";
import { appendPlatformAudit } from "./audit";
import { rawDb as db } from "./db";
import { AppError } from "./errors";

export const PILOT_CERTIFICATION_CHECKS = [
  { key: "journey.platform_owner", title: "Platform Owner journey", domain: "Core journeys", requiredForPilot: true, allowWaiver: false, evidenceMode: "mixed", requiredEnvironments: ["ci", "production"], description: "Platform Owner can inspect/control the school without crossing tenant boundaries." },
  { key: "journey.school_leadership", title: "School Leadership journey", domain: "Core journeys", requiredForPilot: true, allowWaiver: false, evidenceMode: "mixed", requiredEnvironments: ["ci", "production"], description: "Leadership setup, action queue, reporting and school operations complete successfully." },
  { key: "journey.teacher", title: "Teacher journey", domain: "Core journeys", requiredForPilot: true, allowWaiver: false, evidenceMode: "mixed", requiredEnvironments: ["ci", "production"], description: "Assignment-scoped teaching, lesson, academic work and grade workflows are exercised." },
  { key: "journey.family_learner", title: "Family / learner journey", domain: "Core journeys", requiredForPilot: true, allowWaiver: false, evidenceMode: "mixed", requiredEnvironments: ["ci", "production"], description: "Linked-child access works without exposing parent-only or sibling-private data." },
  { key: "cycle.academic", title: "Complete academic cycle", domain: "Workflow rehearsal", requiredForPilot: true, allowWaiver: false, evidenceMode: "mixed", requiredEnvironments: ["ci", "production"], description: "Setup through assignment/grade/report release is rehearsed end to end." },
  { key: "cycle.finance", title: "Complete finance cycle", domain: "Workflow rehearsal", requiredForPilot: true, allowWaiver: false, evidenceMode: "mixed", requiredEnvironments: ["ci", "production"], description: "Invoice, payment, reversal and guardian balance behavior is rehearsed end to end." },
  { key: "communications.sms", title: "Real SMS delivery cycle", domain: "Provider certification", requiredForPilot: true, allowWaiver: false, evidenceMode: "live", requiredEnvironments: ["production"], description: "A real provider send, delivery/failure status and retry/failure handling are exercised." },
  { key: "report_cards.release", title: "Report-card release and guardian access", domain: "Workflow rehearsal", requiredForPilot: true, allowWaiver: false, evidenceMode: "mixed", requiredEnvironments: ["ci", "production"], description: "Approved report release, permanent Family Portal access and configured delivery path are exercised." },
  { key: "security.tenant_isolation", title: "Tenant / IDOR / RLS checks", domain: "Security", requiredForPilot: true, allowWaiver: false, evidenceMode: "mixed", requiredEnvironments: ["ci", "production"], description: "Cross-school access attempts fail against the production schema and application boundaries." },
  { key: "backup.restore", title: "Encrypted backup and restore drill", domain: "Recovery", requiredForPilot: true, allowWaiver: false, evidenceMode: "live", requiredEnvironments: ["production"], description: "A real encrypted backup is retained off-host and restored into an isolated verification database." },
  { key: "operations.runtime", title: "Production secrets, workers and scheduled jobs", domain: "Operations", requiredForPilot: true, allowWaiver: false, evidenceMode: "live", requiredEnvironments: ["production"], description: "Required provider secrets, workers/cron jobs and monitoring are configured and observed." },
  { key: "support.pilot", title: "Pilot support workflow", domain: "Operations", requiredForPilot: true, allowWaiver: false, evidenceMode: "mixed", requiredEnvironments: ["ci", "production"], description: "A school can create a support case and receive/reply to Platform Support in the live deployment." },
  { key: "controlled.whatsapp", title: "WhatsApp provider/template certification", domain: "Controlled beta", requiredForPilot: false, allowWaiver: true, evidenceMode: "live", requiredEnvironments: ["production"], description: "Required only when WhatsApp is enabled for the pilot school." },
  { key: "controlled.transport", title: "Real transport tracker/alerts certification", domain: "Controlled beta", requiredForPilot: false, allowWaiver: true, evidenceMode: "live", requiredEnvironments: ["production"], description: "Required only when real GPS transport is enabled for the pilot school." },
  { key: "controlled.biometrics", title: "Biometric device/network certification", domain: "Controlled beta", requiredForPilot: false, allowWaiver: true, evidenceMode: "live", requiredEnvironments: ["production"], description: "Required only when biometric attendance is enabled for the pilot school." },
] as const;

export type PilotCertificationCheckKey = (typeof PILOT_CERTIFICATION_CHECKS)[number]["key"];
export type PilotCertificationEvidenceStatus = "in_review" | "passed" | "failed" | "waived";
export type PilotCertificationEnvironment = "ci" | "staging" | "production" | "hardware_lab";
export type PilotCertificationCheckState = "not_tested" | "partial" | "in_review" | "passed" | "failed" | "waived" | "expired" | "wrong_environment";

export type PilotCertificationEvidenceRow = {
  id: string;
  schoolId: string;
  checkKey: string;
  status: PilotCertificationEvidenceStatus;
  environment: PilotCertificationEnvironment;
  evidenceSummary: string;
  evidenceRef: string | null;
  commitSha: string | null;
  ciRun: string | null;
  expiresAt: Date | null;
  reviewedByAdminId: string;
  reviewedByName: string;
  reviewedAt: Date;
};

const CHECK_BY_KEY = new Map(PILOT_CERTIFICATION_CHECKS.map((check) => [check.key, check]));
const SECRET_PATTERN = /(authorization\s*:\s*bearer|password\s*[=:]|api[_-]?key\s*[=:]|access[_-]?token\s*[=:]|secret\s*[=:])/i;

function cleanOptional(value: string | null | undefined, max: number) {
  const text = value?.trim();
  if (!text) return null;
  if (text.length > max) throw new AppError(`Certification evidence field exceeds ${max} characters.`, 400, "CERTIFICATION_INPUT_TOO_LONG");
  if (SECRET_PATTERN.test(text)) throw new AppError("Certification evidence must not contain credentials, tokens or secrets.", 400, "CERTIFICATION_SECRET_REJECTED");
  return text;
}

function cleanSummary(value: string) {
  const text = value.trim();
  if (!text || text.length > 2000) throw new AppError("Evidence summary must contain 1–2,000 characters.", 400, "CERTIFICATION_SUMMARY_INVALID");
  if (SECRET_PATTERN.test(text)) throw new AppError("Certification evidence must not contain credentials, tokens or secrets.", 400, "CERTIFICATION_SECRET_REJECTED");
  return text;
}

function rowState(evidence: PilotCertificationEvidenceRow | null, now: Date): PilotCertificationCheckState {
  if (!evidence) return "not_tested";
  if (evidence.expiresAt && evidence.expiresAt <= now) return "expired";
  return evidence.status;
}

function evaluateCheckState(
  check: (typeof PILOT_CERTIFICATION_CHECKS)[number],
  evidenceRows: PilotCertificationEvidenceRow[],
  now: Date,
): PilotCertificationCheckState {
  const sorted = [...evidenceRows].sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime());
  const latestOverall = sorted[0] ?? null;
  if (latestOverall?.status === "waived" && check.allowWaiver && (!latestOverall.expiresAt || latestOverall.expiresAt > now)) return "waived";

  const requiredStates = check.requiredEnvironments.map((environment) => {
    const evidence = evidenceRows.find((row) => row.environment === environment) ?? null;
    return { environment, evidence, state: rowState(evidence, now) };
  });
  if (requiredStates.every((item) => item.state === "passed")) return "passed";
  if (requiredStates.some((item) => item.state === "failed")) return "failed";
  if (requiredStates.some((item) => item.state === "expired")) return "expired";
  if (requiredStates.some((item) => item.state === "in_review")) return "in_review";
  if (requiredStates.some((item) => item.state === "passed")) return "partial";
  if (evidenceRows.some((row) => row.status === "passed" && !check.requiredEnvironments.includes(row.environment as never))) return "wrong_environment";
  return "not_tested";
}

export async function getPilotCertificationOverview(schoolId: string) {
  const school = await db.$queryRawUnsafe<Array<{ id: string; name: string; uniqueCode: string; status: string }>>(
    `SELECT "id","name","uniqueCode","status" FROM "School" WHERE "id"=$1 LIMIT 1`, schoolId,
  );
  if (!school[0]) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
  const latestPerEnvironment = await db.$queryRawUnsafe<PilotCertificationEvidenceRow[]>(
    `SELECT DISTINCT ON (e."checkKey",e."environment") e."id",e."schoolId",e."checkKey",e."status",e."environment",e."evidenceSummary",e."evidenceRef",e."commitSha",e."ciRun",e."expiresAt",e."reviewedByAdminId",a."name" AS "reviewedByName",e."reviewedAt"
     FROM "PilotCertificationEvidence" e
     JOIN "PlatformAdmin" a ON a."id"=e."reviewedByAdminId"
     WHERE e."schoolId"=$1
     ORDER BY e."checkKey",e."environment",e."reviewedAt" DESC,e."createdAt" DESC`,
    schoolId,
  );
  const byKey = new Map<string, PilotCertificationEvidenceRow[]>();
  for (const row of latestPerEnvironment) {
    const rows = byKey.get(row.checkKey) ?? [];
    rows.push(row);
    byKey.set(row.checkKey, rows);
  }
  const now = new Date();
  const checks = PILOT_CERTIFICATION_CHECKS.map((check) => {
    const environmentEvidence = byKey.get(check.key) ?? [];
    const latestEvidence = [...environmentEvidence].sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime())[0] ?? null;
    return {
      ...check,
      state: evaluateCheckState(check, environmentEvidence, now),
      evidence: latestEvidence,
      environmentEvidence: check.requiredEnvironments.map((environment) => ({
        environment,
        state: rowState(environmentEvidence.find((row) => row.environment === environment) ?? null, now),
        evidence: environmentEvidence.find((row) => row.environment === environment) ?? null,
      })),
    };
  });
  const required = checks.filter((check) => check.requiredForPilot);
  const passedRequired = required.filter((check) => check.state === "passed").length;
  const failedRequired = required.filter((check) => check.state === "failed").length;
  const pendingRequired = required.length - passedRequired - failedRequired;
  const controlled = checks.filter((check) => !check.requiredForPilot);
  return {
    school: school[0],
    checks,
    summary: {
      required: required.length,
      passedRequired,
      failedRequired,
      pendingRequired,
      progressPercent: required.length ? Math.round((passedRequired / required.length) * 100) : 0,
      pilotReady: required.length > 0 && passedRequired === required.length,
      controlledPassed: controlled.filter((check) => check.state === "passed").length,
      controlledWaived: controlled.filter((check) => check.state === "waived").length,
      controlledAttention: controlled.filter((check) => !["passed", "waived"].includes(check.state)).length,
    },
  };
}

export async function recordPilotCertificationEvidence(input: {
  adminId: string;
  schoolId: string;
  checkKey: PilotCertificationCheckKey;
  status: PilotCertificationEvidenceStatus;
  environment: PilotCertificationEnvironment;
  evidenceSummary: string;
  evidenceRef?: string | null;
  commitSha?: string | null;
  ciRun?: string | null;
  expiresAt?: Date | null;
}) {
  const check = CHECK_BY_KEY.get(input.checkKey);
  if (!check) throw new AppError("Unknown pilot certification check.", 400, "CERTIFICATION_CHECK_UNKNOWN");
  if (input.status === "waived" && !check.allowWaiver) throw new AppError("This required pilot check cannot be waived.", 409, "CERTIFICATION_WAIVER_FORBIDDEN");
  if (input.status === "passed" && !check.requiredEnvironments.includes(input.environment as never)) {
    throw new AppError(`A pass for ${check.title} must be recorded from: ${check.requiredEnvironments.join(" or ")}.`, 409, "CERTIFICATION_ENVIRONMENT_INVALID");
  }
  if (input.expiresAt && input.expiresAt <= new Date()) throw new AppError("Certification expiry must be in the future.", 400, "CERTIFICATION_EXPIRY_INVALID");
  const summary = cleanSummary(input.evidenceSummary);
  const evidenceRef = cleanOptional(input.evidenceRef, 1000);
  const commitSha = cleanOptional(input.commitSha, 80);
  const ciRun = cleanOptional(input.ciRun, 160);
  const school = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "School" WHERE "id"=$1 LIMIT 1`, input.schoolId);
  if (!school[0]) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
  const id = createId();
  await db.$executeRawUnsafe(
    `INSERT INTO "PilotCertificationEvidence" ("id","schoolId","checkKey","status","environment","evidenceSummary","evidenceRef","commitSha","ciRun","expiresAt","reviewedByAdminId")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    id, input.schoolId, input.checkKey, input.status, input.environment, summary, evidenceRef, commitSha, ciRun, input.expiresAt ?? null, input.adminId,
  );
  await appendPlatformAudit({
    actorId: input.adminId,
    action: "pilot_certification.evidence_recorded",
    targetSchoolId: input.schoolId,
    targetEntity: id,
    meta: { checkKey: input.checkKey, status: input.status, environment: input.environment, hasEvidenceRef: Boolean(evidenceRef), commitSha, ciRun, expiresAt: input.expiresAt?.toISOString() ?? null },
  });
  return { id };
}

export async function listPilotCertificationEvidenceHistory(schoolId: string, checkKey: PilotCertificationCheckKey, limit = 50) {
  if (!CHECK_BY_KEY.has(checkKey)) throw new AppError("Unknown pilot certification check.", 400, "CERTIFICATION_CHECK_UNKNOWN");
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  return db.$queryRawUnsafe<PilotCertificationEvidenceRow[]>(
    `SELECT e."id",e."schoolId",e."checkKey",e."status",e."environment",e."evidenceSummary",e."evidenceRef",e."commitSha",e."ciRun",e."expiresAt",e."reviewedByAdminId",a."name" AS "reviewedByName",e."reviewedAt"
     FROM "PilotCertificationEvidence" e JOIN "PlatformAdmin" a ON a."id"=e."reviewedByAdminId"
     WHERE e."schoolId"=$1 AND e."checkKey"=$2 ORDER BY e."reviewedAt" DESC,e."createdAt" DESC LIMIT $3`,
    schoolId, checkKey, safeLimit,
  );
}
