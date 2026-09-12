import { describe, expect, it } from "vitest";
import { numberBloomArcadeAdapter } from "@/lib/arcade-vnext/games/number-bloom/adapter";
import {
  applyNumberBloomAction,
  buildNumberBloomMission,
  evaluateNumberBloomState,
  type NumberBloomState,
} from "@/lib/arcade-vnext/games/number-bloom/domain";
import { validateNumberBloomMission } from "@/lib/arcade-vnext/games/number-bloom/validation";

function placeLoose(
  bundle: ReturnType<typeof buildNumberBloomMission>,
  itemId: string,
  containerId: string,
  slot: number,
  state: NumberBloomState = bundle.initialState,
) {
  return applyNumberBloomAction(bundle.publicMission, state, {
    kind: "place",
    itemId,
    containerId,
    slot,
  });
}

describe("Number Bloom vNext domain", () => {
  it("builds all greybox mission families as valid, bounded garden states", () => {
    for (const mechanic of ["plant_count", "make_bed", "compare_patches", "free_grow"] as const) {
      for (let variant = 0; variant < 3; variant += 1) {
        const bundle = buildNumberBloomMission(mechanic, variant);
        expect(() => validateNumberBloomMission(
          bundle.publicMission,
          bundle.privateMission,
          bundle.initialState,
        )).not.toThrow();
        expect(bundle.initialState).not.toHaveProperty("elapsedMs");
        expect(bundle.initialState).not.toHaveProperty("timer");
      }
    }
  });

  it("keeps Plant Count editable through overfill and self-correction", () => {
    const bundle = buildNumberBloomMission("plant_count", 0);
    if (bundle.publicMission.mechanic !== "plant_count") throw new Error("Unexpected mechanic");
    const bed = bundle.publicMission.containers[0];
    if (!bed) throw new Error("Missing bed");

    let state = bundle.initialState;
    for (let index = 0; index < bundle.publicMission.targetCount + 1; index += 1) {
      state = placeLoose(bundle, `seed-${index + 1}`, bed.id, index, state);
    }
    const overfilled = evaluateNumberBloomState(bundle.privateMission, state);
    expect(overfilled.demonstrated).toBe(false);
    expect(overfilled.misconception).toBe("overfilled_target_group");

    state = applyNumberBloomAction(bundle.publicMission, state, { kind: "remove", itemId: "seed-4" });
    const corrected = evaluateNumberBloomState(bundle.privateMission, state);
    expect(corrected.demonstrated).toBe(true);
    expect(state.selfCorrections).toBeGreaterThan(0);
  });

  it("accepts multiple mathematically valid Make the Bed compositions", () => {
    for (let variant = 0; variant < 3; variant += 1) {
      const bundle = buildNumberBloomMission("make_bed", variant);
      if (bundle.publicMission.mechanic !== "make_bed" || bundle.privateMission.mechanic !== "make_bed") {
        throw new Error("Unexpected mechanic");
      }
      const [left, right] = bundle.publicMission.containers;
      if (!left || !right) throw new Error("Missing beds");
      const target = bundle.publicMission.targetTotal;
      const startingLeft = target - 2;

      let first = bundle.initialState;
      first = placeLoose(bundle, `flower-${startingLeft + 1}`, right.id, 0, first);
      first = placeLoose(bundle, `flower-${startingLeft + 2}`, right.id, 1, first);
      expect(evaluateNumberBloomState(bundle.privateMission, first).demonstrated).toBe(true);

      let second = bundle.initialState;
      second = applyNumberBloomAction(bundle.publicMission, second, {
        kind: "move",
        itemId: `flower-${startingLeft}`,
        containerId: right.id,
        slot: 0,
      });
      second = placeLoose(bundle, `flower-${startingLeft + 1}`, right.id, 1, second);
      second = placeLoose(bundle, `flower-${startingLeft + 2}`, right.id, 2, second);
      const alternate = evaluateNumberBloomState(bundle.privateMission, second);
      expect(alternate.demonstrated).toBe(true);
      expect(alternate.context).not.toEqual(evaluateNumberBloomState(bundle.privateMission, first).context);
    }
  });

  it("requires spatial pairing before Compare Patches can demonstrate the relationship", () => {
    for (let variant = 0; variant < 3; variant += 1) {
      const bundle = buildNumberBloomMission("compare_patches", variant);
      if (bundle.publicMission.mechanic !== "compare_patches" || bundle.privateMission.mechanic !== "compare_patches") {
        throw new Error("Unexpected mechanic");
      }
      const leftId = bundle.privateMission.criterion.leftContainerId;
      const rightId = bundle.privateMission.criterion.rightContainerId;
      const leftItems = bundle.initialState.items.filter((item) => item.containerId === leftId);
      const rightItems = bundle.initialState.items.filter((item) => item.containerId === rightId);
      let state = bundle.initialState;

      state = applyNumberBloomAction(bundle.publicMission, state, {
        kind: "set_relationship",
        relation: bundle.privateMission.criterion.relation,
      });
      expect(evaluateNumberBloomState(bundle.privateMission, state).demonstrated).toBe(false);

      for (let index = 0; index < Math.min(leftItems.length, rightItems.length); index += 1) {
        const left = leftItems[index];
        const right = rightItems[index];
        if (!left || !right) throw new Error("Missing comparison object");
        state = applyNumberBloomAction(bundle.publicMission, state, {
          kind: "pair",
          leftItemId: left.id,
          rightItemId: right.id,
        });
      }
      expect(evaluateNumberBloomState(bundle.privateMission, state).demonstrated).toBe(true);
    }
  });

  it("does not leak the authoritative Compare Patches relationship in the public mission", () => {
    const bundle = buildNumberBloomMission("compare_patches", 0);
    if (bundle.privateMission.mechanic !== "compare_patches") throw new Error("Unexpected mechanic");
    const publicJson = JSON.stringify(bundle.publicMission);
    expect(publicJson).not.toContain(bundle.privateMission.criterion.relation);
    expect(publicJson).not.toContain("criterion");
  });

  it("fails closed for contradictory or impossible mission state", () => {
    const bundle = buildNumberBloomMission("plant_count", 0);
    if (bundle.privateMission.mechanic !== "plant_count") throw new Error("Unexpected mechanic");

    expect(() => validateNumberBloomMission(
      bundle.publicMission,
      {
        ...bundle.privateMission,
        criterion: { ...bundle.privateMission.criterion, targetCount: 5 },
      },
      bundle.initialState,
    )).toThrow(/do not match/);

    const malformed = structuredClone(bundle.initialState);
    malformed.items[0]!.containerId = "missing-bed";
    malformed.items[0]!.slot = 0;
    expect(() => validateNumberBloomMission(
      bundle.publicMission,
      bundle.privateMission,
      malformed,
    )).toThrow(/unknown container/);
  });

  it("snapshots and resumes constructed state without converting actions to answers", async () => {
    const bundle = buildNumberBloomMission("plant_count", 1);
    if (bundle.publicMission.mechanic !== "plant_count") throw new Error("Unexpected mechanic");
    const bed = bundle.publicMission.containers[0];
    if (!bed) throw new Error("Missing bed");

    let state = bundle.initialState;
    state = placeLoose(bundle, "seed-1", bed.id, 0, state);
    state = placeLoose(bundle, "seed-2", bed.id, 1, state);
    const snapshot = await numberBloomArcadeAdapter.createSnapshot(state);
    const restored = await numberBloomArcadeAdapter.restoreSnapshot(JSON.parse(JSON.stringify(snapshot)));
    let resumed = restored as NumberBloomState;
    resumed = placeLoose(bundle, "seed-3", bed.id, 2, resumed);
    resumed = placeLoose(bundle, "seed-4", bed.id, 3, resumed);

    expect(evaluateNumberBloomState(bundle.privateMission, resumed).demonstrated).toBe(true);
    expect(JSON.stringify(resumed)).not.toContain("answers");
  });

  it("keeps Free Grow ungraded while allowing planting and watering", async () => {
    const bundle = buildNumberBloomMission("free_grow", 0);
    const bed = bundle.publicMission.containers[0];
    if (!bed) throw new Error("Missing bed");
    let state = placeLoose(bundle, "seed-1", bed.id, 0);
    state = applyNumberBloomAction(bundle.publicMission, state, { kind: "water", containerId: bed.id });

    const grade = await numberBloomArcadeAdapter.grade({
      publicMission: bundle.publicMission,
      privateMission: bundle.privateMission,
      state,
      events: [],
      ctx: { schoolId: "school-1", studentId: "student-1", ageBand: "4-5", now: new Date(0) },
    });

    expect(grade.evidence).toEqual([]);
    expect(grade.summary).toMatchObject({ ungraded: true });
    expect(state.wateredContainers).toEqual([bed.id]);
  });
});
