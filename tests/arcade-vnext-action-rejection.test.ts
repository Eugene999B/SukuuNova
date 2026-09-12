import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { ArcadeAdapterRegistry } from "../src/lib/arcade-vnext/registry";
import {
  applyArcadeVNextAction,
  readArcadeVNextSession,
  startArcadeVNextSession,
} from "../src/lib/arcade-vnext/session-service";
import {
  FIXTURE_GAME,
  FIXTURE_SCHEMA,
  fixtureArcadeAdapter,
} from "../src/lib/arcade-vnext/testing/fixture-adapter";
import { createTenantFixture } from "./helpers";

const registry = new ArcadeAdapterRegistry([fixtureArcadeAdapter]);

async function setup() {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async (tx) => {
    const classroom = await tx.class.create({
      data: { schoolId: fixture.schoolId, name: `Reject ${fixture.schoolId}`, level: "Primary 3" },
    });
    const guardian = await tx.guardian.create({
      data: { schoolId: fixture.schoolId, name: "Reject Guardian", userId: fixture.memberId },
    });
    const student = await tx.student.create({
      data: {
        schoolId: fixture.schoolId,
        classId: classroom.id,
        name: "Reject Learner",
        admissionNo: `reject-${fixture.schoolId}`,
      },
    });
    await tx.studentGuardian.create({
      data: {
        schoolId: fixture.schoolId,
        studentId: student.id,
        guardianId: guardian.id,
        relationship: "Parent",
      },
    });
    return { guardianId: guardian.id, studentId: student.id };
  });
  return {
    ...fixture,
    ...ids,
    context: { schoolId: fixture.schoolId, guardianId: ids.guardianId, userId: fixture.memberId },
  };
}

function place(expectedSessionSequence: number, idempotencyKey: string, value: number) {
  return {
    gameSchema: FIXTURE_SCHEMA,
    clientSequence: expectedSessionSequence + 1,
    expectedSessionSequence,
    idempotencyKey,
    actionType: "place",
    payload: { slot: 0, value },
  };
}

describe("Arcade vNext state-dependent action rejection", () => {
  it("returns a safe 400-style adapter rejection without mutating the session", async () => {
    const f = await setup();
    const started = await withTenant(f.schoolId, (tx) => startArcadeVNextSession(tx, f.context, {
      studentId: f.studentId,
      game: FIXTURE_GAME,
      gameSchema: FIXTURE_SCHEMA,
    }, registry));

    await withTenant(f.schoolId, (tx) => applyArcadeVNextAction(
      tx,
      f.context,
      started.id,
      place(0, "reject-first-0001", 1),
      registry,
    ));

    await expect(withTenant(f.schoolId, (tx) => applyArcadeVNextAction(
      tx,
      f.context,
      started.id,
      place(1, "reject-occupied-0001", 2),
      registry,
    ))).rejects.toMatchObject({
      status: 400,
      code: "ARCADE_ACTION_INVALID",
      message: "That tray slot is already filled.",
    });

    const current = await withTenant(f.schoolId, (tx) => readArcadeVNextSession(
      tx,
      f.context,
      started.id,
      registry,
    ));
    expect(current).toMatchObject({
      sessionSequence: 1,
      state: { values: [1, null, null], attempts: 1 },
    });

    const counts = await withTenant(f.schoolId, (tx) => tx.$queryRaw<Array<{ events: number; snapshots: number }>>`
      SELECT
        (SELECT COUNT(*)::int FROM "ArcadeGameEvent" WHERE "sessionId"=${started.id}) AS "events",
        (SELECT COUNT(*)::int FROM "ArcadeGameSnapshot" WHERE "sessionId"=${started.id}) AS "snapshots"`);
    expect(counts[0]).toEqual({ events: 1, snapshots: 2 });
  });
});
