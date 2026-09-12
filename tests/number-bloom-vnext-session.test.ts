import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import type { ArcadeGameAdapter } from "../src/lib/arcade-vnext/adapter";
import { ArcadeAdapterRegistry } from "../src/lib/arcade-vnext/registry";
import {
  applyArcadeVNextAction,
  finishArcadeVNextSession,
  readArcadeVNextSession,
  startArcadeVNextSession,
} from "../src/lib/arcade-vnext/session-service";
import {
  NUMBER_BLOOM_GAME,
  NUMBER_BLOOM_SCHEMA,
  numberBloomArcadeAdapter,
} from "../src/lib/arcade-vnext/games/number-bloom/adapter";
import {
  buildNumberBloomMission,
  numberBloomStateSchema,
} from "../src/lib/arcade-vnext/games/number-bloom/domain";
import { createTenantFixture } from "./helpers";

const plantCountAdapter: ArcadeGameAdapter = {
  ...numberBloomArcadeAdapter,
  createMission() {
    const mission = buildNumberBloomMission("plant_count", 0);
    return { ...mission, skillTargets: ["number_bloom.cardinality"] };
  },
};
const registry = new ArcadeAdapterRegistry([plantCountAdapter]);

async function setup() {
  const fixture = await createTenantFixture();
  const ids = await withTenant(fixture.schoolId, async (tx) => {
    const classroom = await tx.class.create({
      data: { schoolId: fixture.schoolId, name: `Bloom ${fixture.schoolId}`, level: "KG 2" },
    });
    const guardian = await tx.guardian.create({
      data: { schoolId: fixture.schoolId, name: "Bloom Guardian", userId: fixture.memberId },
    });
    const student = await tx.student.create({
      data: {
        schoolId: fixture.schoolId,
        classId: classroom.id,
        name: "Bloom Learner",
        admissionNo: `bloom-${fixture.schoolId}`,
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

function place(expectedSessionSequence: number, itemId: string, slot: number) {
  return {
    gameSchema: NUMBER_BLOOM_SCHEMA,
    clientSequence: expectedSessionSequence + 1,
    expectedSessionSequence,
    idempotencyKey: `bloom-place-${expectedSessionSequence}-${itemId}`,
    actionType: "place",
    payload: { itemId, containerId: "plant-bed", slot },
  };
}

describe("Number Bloom through Arcade vNext persistence", () => {
  it("keeps private criteria off the wire, resumes structured garden state and grades server-side", async () => {
    const f = await setup();
    const started = await withTenant(f.schoolId, (tx) => startArcadeVNextSession(tx, f.context, {
      studentId: f.studentId,
      game: NUMBER_BLOOM_GAME,
      gameSchema: NUMBER_BLOOM_SCHEMA,
      ageBand: "4-5",
    }, registry));

    expect(started).toMatchObject({
      game: NUMBER_BLOOM_GAME,
      gameSchema: NUMBER_BLOOM_SCHEMA,
      sessionSequence: 0,
      skillTargets: ["number_bloom.cardinality"],
      mission: { mechanic: "plant_count", targetCount: 3 },
    });
    expect(JSON.stringify(started)).not.toContain("criterion");
    expect(JSON.stringify(started)).not.toContain("exact_count");
    expect(JSON.stringify(started)).not.toContain("answers");

    await withTenant(f.schoolId, (tx) => applyArcadeVNextAction(
      tx, f.context, started.id, place(0, "seed-1", 0), registry,
    ));
    await withTenant(f.schoolId, (tx) => applyArcadeVNextAction(
      tx, f.context, started.id, place(1, "seed-2", 1), registry,
    ));

    const resumed = await withTenant(f.schoolId, (tx) => readArcadeVNextSession(
      tx, f.context, started.id, registry,
    ));
    expect(resumed.sessionSequence).toBe(2);
    const resumedState = numberBloomStateSchema.parse(resumed.state);
    expect(resumedState.interactionCount).toBe(2);
    expect(resumedState.items.find((item) => item.id === "seed-1")).toMatchObject({
      containerId: "plant-bed",
      slot: 0,
    });
    expect(resumedState.items.find((item) => item.id === "seed-2")).toMatchObject({
      containerId: "plant-bed",
      slot: 1,
    });

    const completedConstruction = await withTenant(f.schoolId, (tx) => applyArcadeVNextAction(
      tx, f.context, started.id, place(2, "seed-3", 2), registry,
    ));
    expect(completedConstruction.session.sessionSequence).toBe(3);
    expect(completedConstruction.evidence[0]).toMatchObject({
      skillKey: "number_bloom.cardinality",
      outcome: "demonstrated",
    });

    const finished = await withTenant(f.schoolId, (tx) => finishArcadeVNextSession(tx, f.context, started.id, {
      gameSchema: NUMBER_BLOOM_SCHEMA,
      clientSequence: 4,
      expectedSessionSequence: 3,
      idempotencyKey: "bloom-finish-0001",
    }, registry));
    expect(finished.session.status).toBe("completed");
    expect(finished.session.assessment?.summary).toMatchObject({
      demonstrated: true,
      mechanic: "plant_count",
      interactions: 3,
    });
    expect(finished.session.assessment?.evidence[0]).toMatchObject({
      outcome: "demonstrated",
      confidence: 1,
    });

    const stored = await withTenant(f.schoolId, (tx) => tx.$queryRaw<Array<{
      publicMission: unknown;
      privateMission: unknown;
    }>>`SELECT "publicMission","privateMission" FROM "ArcadeGameSession" WHERE "id"=${started.id}`);
    expect(JSON.stringify(stored[0]?.publicMission)).not.toContain("criterion");
    expect(JSON.stringify(stored[0]?.privateMission)).toContain("exact_count");

    const eventWire = await withTenant(f.schoolId, (tx) => tx.$queryRaw<Array<{ response: unknown }>>`
      SELECT "response" FROM "ArcadeGameEvent" WHERE "sessionId"=${started.id} ORDER BY "sequence" ASC`);
    expect(JSON.stringify(eventWire)).not.toContain("criterion");
    expect(JSON.stringify(eventWire)).not.toContain("exact_count");
  });
});
