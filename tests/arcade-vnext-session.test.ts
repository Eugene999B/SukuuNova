import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { ArcadeAdapterRegistry } from "../src/lib/arcade-vnext/registry";
import {
  applyArcadeVNextAction,
  finishArcadeVNextSession,
  readArcadeVNextSession,
  startArcadeVNextSession,
  submitArcadeVNextArtifact,
} from "../src/lib/arcade-vnext/session-service";
import {
  FIXTURE_GAME,
  FIXTURE_SCHEMA,
  FIXTURE_SECRET,
  fixtureArcadeAdapter,
} from "../src/lib/arcade-vnext/testing/fixture-adapter";
import { assertRlsTestRoleIsSafe, createTenantFixture, rawDb } from "./helpers";

const registry = new ArcadeAdapterRegistry([fixtureArcadeAdapter]);

async function setup() {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async (tx) => {
    const classroom = await tx.class.create({
      data: { schoolId: fixture.schoolId, name: `vNext ${fixture.schoolId}`, level: "Primary 3" },
    });
    const guardian = await tx.guardian.create({
      data: { schoolId: fixture.schoolId, name: "vNext Guardian", userId: fixture.memberId },
    });
    const linked = await tx.student.create({
      data: { schoolId: fixture.schoolId, classId: classroom.id, name: "vNext Learner", admissionNo: `vn-${fixture.schoolId}` },
    });
    const unlinked = await tx.student.create({
      data: { schoolId: fixture.schoolId, classId: classroom.id, name: "Other Learner", admissionNo: `vn-other-${fixture.schoolId}` },
    });
    await tx.studentGuardian.create({
      data: { schoolId: fixture.schoolId, studentId: linked.id, guardianId: guardian.id, relationship: "Parent" },
    });
    return { guardianId: guardian.id, studentId: linked.id, unlinkedStudentId: unlinked.id };
  });
  return {
    ...fixture,
    ...ids,
    context: { schoolId: fixture.schoolId, guardianId: ids.guardianId, userId: fixture.memberId },
  };
}

function action(gameSchema: string, expectedSessionSequence: number, idempotencyKey: string, slot: number, value: number) {
  return {
    gameSchema,
    clientSequence: expectedSessionSequence + 1,
    expectedSessionSequence,
    idempotencyKey,
    actionType: "place",
    payload: { slot, value },
  };
}

describe("Arcade vNext session persistence", () => {
  it("starts a fixture session without serializing private mission truth", async () => {
    const f = await setup();
    const session = await withTenant(f.schoolId, (tx) => startArcadeVNextSession(tx, f.context, {
      studentId: f.studentId,
      game: FIXTURE_GAME,
      gameSchema: FIXTURE_SCHEMA,
      ageBand: "age_6_8",
    }, registry));

    expect(session).toMatchObject({
      studentId: f.studentId,
      game: FIXTURE_GAME,
      gameSchema: FIXTURE_SCHEMA,
      status: "active",
      sessionSequence: 0,
      skillTargets: ["fixture.balance"],
    });
    expect(JSON.stringify(session)).not.toContain(FIXTURE_SECRET);
    expect(JSON.stringify(session)).not.toContain("targetSum");

    const stored = await withTenant(f.schoolId, (tx) => tx.$queryRaw<Array<{ publicMission: unknown; privateMission: unknown }>>`
      SELECT "publicMission","privateMission" FROM "ArcadeGameSession" WHERE "id"=${session.id}`);
    expect(JSON.stringify(stored[0].publicMission)).not.toContain(FIXTURE_SECRET);
    expect(JSON.stringify(stored[0].privateMission)).toContain(FIXTURE_SECRET);
    expect(JSON.stringify(stored[0].privateMission)).toContain("targetSum");
  });

  it("authorizes only the linked active child before a vNext session can start", async () => {
    const f = await setup();
    await expect(withTenant(f.schoolId, (tx) => startArcadeVNextSession(tx, f.context, {
      studentId: f.unlinkedStudentId,
      game: FIXTURE_GAME,
      gameSchema: FIXTURE_SCHEMA,
    }, registry))).rejects.toMatchObject({ status: 403 });
  });

  it("rejects invalid actions without advancing authoritative state", async () => {
    const f = await setup();
    const session = await withTenant(f.schoolId, (tx) => startArcadeVNextSession(tx, f.context, {
      studentId: f.studentId, game: FIXTURE_GAME, gameSchema: FIXTURE_SCHEMA,
    }, registry));

    await expect(withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id, {
      gameSchema: FIXTURE_SCHEMA,
      clientSequence: 1,
      expectedSessionSequence: 0,
      idempotencyKey: "invalid-action-0001",
      actionType: "place",
      payload: { slot: 99, value: 1 },
    }, registry))).rejects.toMatchObject({ status: 400, code: "ARCADE_ACTION_INVALID" });

    const current = await withTenant(f.schoolId, (tx) => readArcadeVNextSession(tx, f.context, session.id, registry));
    expect(current.sessionSequence).toBe(0);
    expect(current.state).toEqual({ values: [null, null, null], attempts: 0 });
  });

  it("commits one event for concurrent idempotent retries and returns the same result", async () => {
    const f = await setup();
    const session = await withTenant(f.schoolId, (tx) => startArcadeVNextSession(tx, f.context, {
      studentId: f.studentId, game: FIXTURE_GAME, gameSchema: FIXTURE_SCHEMA,
    }, registry));
    const request = action(FIXTURE_SCHEMA, 0, "idem-concurrent-0001", 0, 1);

    const [first, second] = await Promise.all([
      withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id, request, registry)),
      withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id, request, registry)),
    ]);
    expect(first).toEqual(second);
    expect(first.session.sessionSequence).toBe(1);
    expect(first.session.state).toEqual({ values: [1, null, null], attempts: 1 });

    const counts = await withTenant(f.schoolId, (tx) => tx.$queryRaw<Array<{ events: number; snapshots: number }>>`
      SELECT
        (SELECT COUNT(*)::int FROM "ArcadeGameEvent" WHERE "sessionId"=${session.id}) AS "events",
        (SELECT COUNT(*)::int FROM "ArcadeGameSnapshot" WHERE "sessionId"=${session.id}) AS "snapshots"`);
    expect(counts[0]).toEqual({ events: 1, snapshots: 2 });
  });

  it("returns authoritative state for stale writes and refuses idempotency-key reuse", async () => {
    const f = await setup();
    const session = await withTenant(f.schoolId, (tx) => startArcadeVNextSession(tx, f.context, {
      studentId: f.studentId, game: FIXTURE_GAME, gameSchema: FIXTURE_SCHEMA,
    }, registry));
    await withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id,
      action(FIXTURE_SCHEMA, 0, "idem-first-0001", 0, 1), registry));

    await expect(withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id,
      action(FIXTURE_SCHEMA, 0, "idem-stale-0001", 1, 2), registry)))
      .rejects.toMatchObject({ code: "SESSION_OUT_OF_DATE", authoritative: { sessionSequence: 1 } });

    await expect(withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id,
      action(FIXTURE_SCHEMA, 1, "idem-first-0001", 1, 2), registry)))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", authoritative: { sessionSequence: 1 } });
  });

  it("resumes from durable state, persists an artifact, grades on the server and freezes completion", async () => {
    const f = await setup();
    const session = await withTenant(f.schoolId, (tx) => startArcadeVNextSession(tx, f.context, {
      studentId: f.studentId, game: FIXTURE_GAME, gameSchema: FIXTURE_SCHEMA,
    }, registry));
    await withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id,
      action(FIXTURE_SCHEMA, 0, "place-one-0001", 0, 1), registry));
    await withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id,
      action(FIXTURE_SCHEMA, 1, "place-two-0001", 1, 2), registry));
    await withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id,
      action(FIXTURE_SCHEMA, 2, "place-three-0001", 2, 3), registry));

    const resumed = await withTenant(f.schoolId, (tx) => readArcadeVNextSession(tx, f.context, session.id, registry));
    expect(resumed).toMatchObject({ sessionSequence: 3, state: { values: [1, 2, 3], attempts: 3 } });

    const artifact = await withTenant(f.schoolId, (tx) => submitArcadeVNextArtifact(tx, f.context, session.id, {
      gameSchema: FIXTURE_SCHEMA,
      clientSequence: 4,
      expectedSessionSequence: 3,
      idempotencyKey: "artifact-note-0001",
      artifactType: "note",
      payload: { note: "I balanced the three slots by testing combinations." },
    }, registry));
    expect(artifact.artifactId).toBeTruthy();
    expect(artifact.session.sessionSequence).toBe(4);

    const finishRequest = {
      gameSchema: FIXTURE_SCHEMA,
      clientSequence: 5,
      expectedSessionSequence: 4,
      idempotencyKey: "finish-session-0001",
    };
    const finished = await withTenant(f.schoolId, (tx) => finishArcadeVNextSession(tx, f.context, session.id, finishRequest, registry));
    expect(finished.session.status).toBe("completed");
    expect(finished.session.sessionSequence).toBe(5);
    expect(finished.session.assessment?.summary).toMatchObject({ score: 100, complete: true, attempts: 3 });
    expect(finished.session.assessment?.evidence[0]).toMatchObject({ outcome: "demonstrated", confidence: 1 });

    const retriedFinish = await withTenant(f.schoolId, (tx) => finishArcadeVNextSession(tx, f.context, session.id, finishRequest, registry));
    expect(retriedFinish).toEqual(finished);

    await expect(withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id,
      action(FIXTURE_SCHEMA, 5, "after-complete-0001", 0, 4), registry)))
      .rejects.toMatchObject({ code: "SESSION_COMPLETED", authoritative: { status: "completed", sessionSequence: 5 } });

    const eventWire = await withTenant(f.schoolId, (tx) => tx.$queryRaw<Array<{ response: unknown }>>`
      SELECT "response" FROM "ArcadeGameEvent" WHERE "sessionId"=${session.id}`);
    expect(JSON.stringify(eventWire)).not.toContain(FIXTURE_SECRET);
    expect(JSON.stringify(eventWire)).not.toContain("targetSum");
  });

  it("enforces FORCE RLS across every vNext persistence table", async () => {
    await assertRlsTestRoleIsSafe();
    const f = await setup();
    const other = await setup();
    const session = await withTenant(f.schoolId, (tx) => startArcadeVNextSession(tx, f.context, {
      studentId: f.studentId, game: FIXTURE_GAME, gameSchema: FIXTURE_SCHEMA,
    }, registry));
    await withTenant(f.schoolId, (tx) => applyArcadeVNextAction(tx, f.context, session.id,
      action(FIXTURE_SCHEMA, 0, "rls-action-0001", 0, 1), registry));

    const hidden = await withTenant(other.schoolId, (tx) => tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ArcadeGameSession" WHERE "id"=${session.id}`);
    expect(hidden).toEqual([]);

    const policies = await rawDb.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>>`
      SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
       WHERE relname IN ('ArcadeGameSession','ArcadeGameEvent','ArcadeGameSnapshot','ArcadeGameArtifact','ArcadeGameAssessment')
       ORDER BY relname`;
    expect(policies).toHaveLength(5);
    expect(policies.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });
});
