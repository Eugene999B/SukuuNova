import { describe, expect, it } from "vitest";
import { numberBloomArcadeAdapter } from "@/lib/arcade-vnext/games/number-bloom/adapter";
import {
  buildNumberBloomMission,
  type NumberBloomAction,
} from "@/lib/arcade-vnext/games/number-bloom/domain";

const ctx = {
  schoolId: "school-1",
  studentId: "student-1",
  ageBand: "4-5",
  now: new Date(0),
};

async function apply(
  bundle: ReturnType<typeof buildNumberBloomMission>,
  state: unknown,
  action: NumberBloomAction,
) {
  return numberBloomArcadeAdapter.applyAction({
    publicMission: bundle.publicMission,
    privateMission: bundle.privateMission,
    state,
    action,
    ctx,
  });
}

describe("Number Bloom state-dependent action rejection", () => {
  it("rejects an occupied garden hole as a safe client mistake", async () => {
    const bundle = buildNumberBloomMission("plant_count", 0);
    const bed = bundle.publicMission.containers[0];
    if (!bed) throw new Error("Missing bed");

    const first = await apply(bundle, bundle.initialState, {
      kind: "place",
      itemId: "seed-1",
      containerId: bed.id,
      slot: 0,
    });

    await expect(apply(bundle, first.state, {
      kind: "place",
      itemId: "seed-2",
      containerId: bed.id,
      slot: 0,
    })).rejects.toMatchObject({
      status: 400,
      code: "ARCADE_ACTION_INVALID",
    });
  });

  it("keeps Compare Patches quantities fixed and asks the child to pair instead", async () => {
    const bundle = buildNumberBloomMission("compare_patches", 0);
    const item = bundle.initialState.items[0];
    const otherPatch = bundle.publicMission.containers.find(
      (container) => container.id !== item?.containerId,
    );
    if (!item || !otherPatch) throw new Error("Missing comparison state");

    await expect(apply(bundle, bundle.initialState, {
      kind: "move",
      itemId: item.id,
      containerId: otherPatch.id,
      slot: otherPatch.capacity - 1,
    })).rejects.toMatchObject({
      status: 400,
      code: "ARCADE_ACTION_INVALID",
      message: expect.stringMatching(/stay in their patches/i),
    });
  });

  it("reserves watering for ungraded Free Grow", async () => {
    const bundle = buildNumberBloomMission("plant_count", 0);
    const bed = bundle.publicMission.containers[0];
    if (!bed) throw new Error("Missing bed");

    await expect(apply(bundle, bundle.initialState, {
      kind: "water",
      containerId: bed.id,
    })).rejects.toMatchObject({
      status: 400,
      code: "ARCADE_ACTION_INVALID",
      message: expect.stringMatching(/Free Grow/i),
    });
  });
});
