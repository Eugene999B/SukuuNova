import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import {
  PILOT_CERTIFICATION_CHECKS,
  getPilotCertificationOverview,
  listPilotCertificationEvidenceHistory,
  recordPilotCertificationEvidence,
} from "../src/lib/pilot-certification-service";
import { createTenantFixture, rawDb } from "./helpers";

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
  it("keeps mixed checks partial until both CI and production evidence pass", async () => {
    const f = await setup();
    await recordPilotCertificationEvidence({
      adminId: f.adminId,
      schoolId: f.schoolId,
      checkKey: "journey.teacher",
      status: "passed",
      environment: "ci",
      evidenceSummary: "Assignment-scoped teacher integration journey passed in CI.",
      commitSha: "abc123",
      ciRun: "2684",
    });
    let overview = await getPilotCertificationOverview(f.schoolId);
    expect(overview.checks.find((check) => check.key === "journey.teacher")?.state).toBe("partial");
    expect(overview.summary.pilotReady).toBe(false);

    await recordPilotCertificationEvidence({
      adminId: f.adminId,
      schoolId: f.schoolId,
      checkKey: "journey.teacher",
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
  });
});
