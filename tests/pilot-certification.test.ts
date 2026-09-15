import { createId } from "@paralleldrive/cuid2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PILOT_CERTIFICATION_CHECKS,
  getPilotCertificationOverview,
  listPilotCertificationEvidenceHistory,
  recordPilotCertificationEvidence,
} from "../src/lib/pilot-certification-service";
import { createTenantFixture, rawDb } from "./helpers";

const testedSha = "a".repeat(40);
beforeEach(() => vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", testedSha));
afterEach(() => vi.unstubAllEnvs());
const evidence = () => ({ commitSha: testedSha, ciRun: "test-run", evidenceRef: "https://example.test/evidence", expiresAt: new Date(Date.now() + 86_400_000) });

async function setup() {
  const fixture = await createTenantFixture();
  const adminId = createId();
  await rawDb.platformAdmin.create({
    data: {
      id: adminId,
      name: "Pilot Reviewer",
      email: `${adminId}@platform.test.invalid`,
      passwordHash: "not-used-by-test",
      role: "super_admin",
      status: "active",
    },
  });
  return { ...fixture, adminId };
}

describe("pilot certification ledger", () => {
  it("rejects undocumented passes and waivers for enabled hardware", async () => {
    const f = await setup();
    await expect(recordPilotCertificationEvidence({ adminId: f.adminId, schoolId: f.schoolId, checkKey: "backup.restore", status: "passed", environment: "production", evidenceSummary: "No linked proof." })).rejects.toMatchObject({ code: "CERTIFICATION_EVIDENCE_REQUIRED" });
    const { withTenant } = await import("../src/lib/db");
    await withTenant(f.schoolId, (tx) => tx.device.create({ data: { schoolId: f.schoolId, deviceSerial: createId(), kind: "card", label: "Test", apiKeyHash: "test-only", status: "active" } }));
    const overview = await getPilotCertificationOverview(f.schoolId);
    expect(overview.checks.find((check) => check.key === "controlled.biometrics")?.requiredForPilot).toBe(true);
    await expect(recordPilotCertificationEvidence({ adminId: f.adminId, schoolId: f.schoolId, checkKey: "controlled.biometrics", status: "waived", environment: "production", evidenceSummary: "Hardware still enabled." })).rejects.toMatchObject({ code: "CERTIFICATION_WAIVER_FORBIDDEN" });
  });

  it("keeps mixed checks partial until both CI and production evidence pass", async () => {
    const f = await setup();
    await recordPilotCertificationEvidence({
      adminId: f.adminId,
      schoolId: f.schoolId,
      checkKey: "journey.teacher",
      ...evidence(),
      status: "passed",
      environment: "ci",
      evidenceSummary: "Assignment-scoped teacher integration journey passed in CI.",
      ciRun: "2684",
    });
    let overview = await getPilotCertificationOverview(f.schoolId);
    expect(overview.checks.find((check) => check.key === "journey.teacher")?.state).toBe("partial");
    expect(overview.summary.pilotReady).toBe(false);

    await recordPilotCertificationEvidence({
      adminId: f.adminId,
      schoolId: f.schoolId,
      checkKey: "journey.teacher",
      ...evidence(),
      status: "passed",
      environment: "production",
      evidenceSummary: "Teacher completed lesson, assignment and grade workflow in the pilot deployment.",
    });
    overview = await getPilotCertificationOverview(f.schoolId);
    expect(overview.checks.find((check) => check.key === "journey.teacher")?.state).toBe("passed");
  });

  it("rejects a CI pass for production-only evidence and forbids waiving required checks", async () => {
    const f = await setup();
    await expect(recordPilotCertificationEvidence({
      adminId: f.adminId,
      schoolId: f.schoolId,
      checkKey: "communications.sms",
      ...evidence(),
      status: "passed",
      environment: "ci",
      evidenceSummary: "A mocked SMS provider returned success.",
    })).rejects.toMatchObject({ code: "CERTIFICATION_ENVIRONMENT_INVALID" });

    await expect(recordPilotCertificationEvidence({
      adminId: f.adminId,
      schoolId: f.schoolId,
      checkKey: "backup.restore",
      status: "waived",
      environment: "production",
      evidenceSummary: "Attempted waiver.",
    })).rejects.toMatchObject({ code: "CERTIFICATION_WAIVER_FORBIDDEN" });
  });

  it("allows controlled capabilities to be explicitly waived and preserves that decision", async () => {
    const f = await setup();
    await recordPilotCertificationEvidence({
      adminId: f.adminId,
      schoolId: f.schoolId,
      checkKey: "controlled.whatsapp",
      status: "waived",
      environment: "production",
      evidenceSummary: "WhatsApp is disabled for this pilot school's agreed scope.",
    });
    const overview = await getPilotCertificationOverview(f.schoolId);
    expect(overview.checks.find((check) => check.key === "controlled.whatsapp")?.state).toBe("waived");
    expect(overview.summary.controlledWaived).toBe(1);
  });

  it("rejects likely secret material from certification notes", async () => {
    const f = await setup();
    await expect(recordPilotCertificationEvidence({
      adminId: f.adminId,
      schoolId: f.schoolId,
      checkKey: "operations.runtime",
      status: "in_review",
      environment: "production",
      evidenceSummary: "api_key=should-never-be-written-here",
    })).rejects.toMatchObject({ code: "CERTIFICATION_SECRET_REJECTED" });
  });

  it("keeps evidence append-only and exposes chronological review history", async () => {
    const f = await setup();
    const first = await recordPilotCertificationEvidence({
      adminId: f.adminId,
      schoolId: f.schoolId,
      checkKey: "backup.restore",
      status: "failed",
      environment: "production",
      evidenceSummary: "Restore drill failed during archive verification.",
    });
    await recordPilotCertificationEvidence({
      adminId: f.adminId,
      schoolId: f.schoolId,
      checkKey: "backup.restore",
      ...evidence(),
      status: "passed",
      environment: "production",
      evidenceSummary: "Retest restored the encrypted archive successfully into an isolated database.",
    });
    const history = await listPilotCertificationEvidenceHistory(f.schoolId, "backup.restore");
    expect(history).toHaveLength(2);
    expect(history[0].status).toBe("passed");
    expect(history[1].status).toBe("failed");
    await expect(rawDb.$executeRawUnsafe(`UPDATE "PilotCertificationEvidence" SET "status"='passed' WHERE "id"=$1`, first.id)).rejects.toThrow(/APPEND_ONLY/);
    await expect(rawDb.$executeRawUnsafe(`DELETE FROM "PilotCertificationEvidence" WHERE "id"=$1`, first.id)).rejects.toThrow(/APPEND_ONLY/);
  });

  it("marks the school pilot-ready only after every required environment has a current pass", async () => {
    const f = await setup();
    for (const check of PILOT_CERTIFICATION_CHECKS.filter((item) => item.requiredForPilot)) {
      for (const environment of check.requiredEnvironments) {
        await recordPilotCertificationEvidence({
          adminId: f.adminId,
          schoolId: f.schoolId,
          checkKey: check.key,
          ...evidence(),
      status: "passed",
          environment,
          evidenceSummary: `${check.title} passed the ${environment} certification gate.`,
        });
      }
    }
    const overview = await getPilotCertificationOverview(f.schoolId);
    expect(overview.summary.passedRequired).toBe(overview.summary.required);
    expect(overview.summary.progressPercent).toBe(100);
    expect(overview.summary.pilotReady).toBe(true);
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "b".repeat(40));
    const afterDeployment = await getPilotCertificationOverview(f.schoolId);
    expect(afterDeployment.summary.pilotReady).toBe(false);
    expect(afterDeployment.checks.some((check) => check.state === "stale_evidence")).toBe(true);
  });
});
