import { describe, expect, it, vi } from "vitest";
import { arcadePayloadFitsBudget, type ArcadeSessionEnvelope } from "../src/lib/arcade-vnext/contracts";
import { ArcadeAdapterRegistry, arcadeAdapterRegistry } from "../src/lib/arcade-vnext/registry";
import {
  FIXTURE_GAME,
  FIXTURE_SCHEMA,
  FIXTURE_SECRET,
  fixtureArcadeAdapter,
} from "../src/lib/arcade-vnext/testing/fixture-adapter";
import { ArcadeSessionOutOfDateError, ArcadeVNextClient } from "../src/lib/arcade-vnext/client-sdk";

const ctx = {
  schoolId: "school-fixture",
  studentId: "student-fixture",
  ageBand: "age_6_8",
  now: new Date("2026-09-12T18:00:00.000Z"),
};

function envelope(sequence = 0): ArcadeSessionEnvelope {
  return {
    id: "session-fixture",
    studentId: ctx.studentId,
    game: FIXTURE_GAME,
    gameSchema: FIXTURE_SCHEMA,
    ageBand: ctx.ageBand,
    status: "active",
    sessionSequence: sequence,
    mission: { title: "Balance the test tray", slots: 3, allowedValues: [1, 2, 3, 4] },
    state: { values: sequence ? [1, null, null] : [null, null, null], attempts: sequence },
    skillTargets: ["fixture.balance"],
    startedAt: ctx.now.toISOString(),
    completedAt: null,
  };
}

describe("Arcade vNext contract", () => {
  it("keeps the production adapter registry empty and fails closed on unknown versions", () => {
    expect(arcadeAdapterRegistry.keys()).toEqual([]);
    expect(() => arcadeAdapterRegistry.require(FIXTURE_GAME, FIXTURE_SCHEMA)).toThrowError(
      expect.objectContaining({ code: "ARCADE_SCHEMA_UNAVAILABLE", status: 409 }),
    );
  });

  it("registers fixture adapters explicitly and rejects duplicate schema ownership", () => {
    const registry = new ArcadeAdapterRegistry([fixtureArcadeAdapter]);
    expect(registry.require(FIXTURE_GAME, FIXTURE_SCHEMA)).toBe(fixtureArcadeAdapter);
    expect(() => registry.register(fixtureArcadeAdapter)).toThrow(/Duplicate Arcade adapter registration/);
  });

  it("keeps private mission truth out of public mission and state serialization", async () => {
    const mission = await fixtureArcadeAdapter.createMission(ctx);
    fixtureArcadeAdapter.publicMissionSchema.parse(mission.publicMission);
    fixtureArcadeAdapter.privateMissionSchema.parse(mission.privateMission);
    fixtureArcadeAdapter.stateSchema.parse(mission.initialState);

    const publicWire = JSON.stringify({
      mission: mission.publicMission,
      state: fixtureArcadeAdapter.serializePublicState(mission.initialState),
      skillTargets: mission.skillTargets,
    });
    expect(publicWire).not.toContain(FIXTURE_SECRET);
    expect(publicWire).not.toContain("targetSum");
    expect(JSON.stringify(mission.privateMission)).toContain(FIXTURE_SECRET);
  });

  it("uses structured game actions and authoritative private state for grading", async () => {
    const mission = await fixtureArcadeAdapter.createMission(ctx);
    let state = mission.initialState;
    for (const [slot, value] of [[0, 1], [1, 2], [2, 3]] as const) {
      const action = fixtureArcadeAdapter.parseAction("place", { slot, value });
      const applied = await fixtureArcadeAdapter.applyAction({
        publicMission: mission.publicMission,
        privateMission: mission.privateMission,
        state,
        action,
        ctx,
      });
      state = applied.state;
    }
    const grade = await fixtureArcadeAdapter.grade({
      publicMission: mission.publicMission,
      privateMission: mission.privateMission,
      state,
      events: [],
      ctx,
    });
    expect(grade.summary).toMatchObject({ score: 100, complete: true, attempts: 3 });
    expect(grade.evidence).toEqual([
      expect.objectContaining({ skillKey: "fixture.balance", outcome: "demonstrated", confidence: 1 }),
    ]);
    expect(() => fixtureArcadeAdapter.parseAction("place", { slot: 99, value: 1 })).toThrow();
  });

  it("rejects payloads beyond the platform boundary budget", () => {
    expect(arcadePayloadFitsBudget({ action: "small" })).toBe(true);
    expect(arcadePayloadFitsBudget({ payload: "x".repeat(70 * 1024) })).toBe(false);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(arcadePayloadFitsBudget(cyclic)).toBe(false);
  });
});

describe("Arcade vNext client SDK", () => {
  it("retries a transport failure with the exact same idempotency envelope", async () => {
    const requests: string[] = [];
    let call = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify(envelope()), { status: 200, headers: { "Content-Type": "application/json" } });
      requests.push(String(init?.body));
      if (call === 2) throw new Error("temporary network loss");
      return new Response(JSON.stringify({
        session: envelope(1),
        feedback: [],
        evidence: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = new ArcadeVNextClient(fetchMock as typeof fetch);
    await client.start({ studentId: ctx.studentId, game: FIXTURE_GAME, gameSchema: FIXTURE_SCHEMA });
    await client.dispatch("place", { slot: 0, value: 1 }, { idempotencyKey: "idem-retry-0001" });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toBe(requests[1]);
    expect(JSON.parse(requests[0])).toMatchObject({
      idempotencyKey: "idem-retry-0001",
      expectedSessionSequence: 0,
      actionType: "place",
    });
    expect(client.session?.sessionSequence).toBe(1);
  });

  it("reconciles authoritative state on a stale-sequence conflict", async () => {
    let call = 0;
    const authoritative = envelope(1);
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify(envelope()), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({
        error: "SESSION_OUT_OF_DATE",
        message: "Session changed.",
        authoritative,
      }), { status: 409, headers: { "Content-Type": "application/json" } });
    });
    const client = new ArcadeVNextClient(fetchMock as typeof fetch);
    await client.start({ studentId: ctx.studentId, game: FIXTURE_GAME, gameSchema: FIXTURE_SCHEMA });
    await expect(client.dispatch("place", { slot: 0, value: 1 }, { idempotencyKey: "idem-stale-0001" }))
      .rejects.toBeInstanceOf(ArcadeSessionOutOfDateError);
    expect(client.session).toEqual(authoritative);
  });
});
