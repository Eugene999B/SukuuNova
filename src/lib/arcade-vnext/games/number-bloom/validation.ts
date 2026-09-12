import {
  numberBloomPrivateMissionSchema,
  numberBloomPublicMissionSchema,
  numberBloomStateSchema,
  type NumberBloomPrivateMission,
  type NumberBloomPublicMission,
  type NumberBloomState,
} from "./domain";

export type ValidatedNumberBloomMission = {
  publicMission: NumberBloomPublicMission;
  privateMission: NumberBloomPrivateMission;
  state: NumberBloomState;
};

export function validateNumberBloomMission(
  publicMissionInput: unknown,
  privateMissionInput: unknown,
  stateInput: unknown,
): ValidatedNumberBloomMission {
  const publicMission = numberBloomPublicMissionSchema.parse(publicMissionInput);
  const privateMission = numberBloomPrivateMissionSchema.parse(privateMissionInput);
  const state = numberBloomStateSchema.parse(stateInput);

  if (publicMission.mechanic !== privateMission.mechanic) {
    throw new Error("Number Bloom public/private mechanics do not match.");
  }

  const containers = new Map(publicMission.containers.map((container) => [container.id, container]));
  if (containers.size !== publicMission.containers.length) {
    throw new Error("Number Bloom mission contains duplicate container ids.");
  }

  for (const item of state.items) {
    if (item.containerId === null) continue;
    const container = containers.get(item.containerId);
    if (!container) throw new Error(`Number Bloom item ${item.id} references an unknown container.`);
    if (item.slot === null || item.slot >= container.capacity) {
      throw new Error(`Number Bloom item ${item.id} occupies an impossible slot.`);
    }
  }

  if (publicMission.mechanic === "plant_count" && privateMission.mechanic === "plant_count") {
    const container = containers.get(privateMission.criterion.containerId);
    if (!container) throw new Error("Plant Count criterion references an unknown bed.");
    if (privateMission.criterion.targetCount !== publicMission.targetCount) {
      throw new Error("Plant Count visible target and authoritative target do not match.");
    }
    if (privateMission.criterion.targetCount > container.capacity) {
      throw new Error("Plant Count target exceeds bed capacity.");
    }
  }

  if (publicMission.mechanic === "make_bed" && privateMission.mechanic === "make_bed") {
    const [firstId, secondId] = privateMission.criterion.containerIds;
    if (!firstId || !secondId || firstId === secondId) {
      throw new Error("Make the Bed requires two distinct authoritative containers.");
    }
    const first = containers.get(firstId);
    const second = containers.get(secondId);
    if (!first || !second) throw new Error("Make the Bed criterion references an unknown bed.");
    if (privateMission.criterion.targetTotal !== publicMission.targetTotal) {
      throw new Error("Make the Bed visible target and authoritative target do not match.");
    }
    if (privateMission.criterion.targetTotal > first.capacity + second.capacity) {
      throw new Error("Make the Bed target exceeds available capacity.");
    }
  }

  if (publicMission.mechanic === "compare_patches" && privateMission.mechanic === "compare_patches") {
    const left = containers.get(privateMission.criterion.leftContainerId);
    const right = containers.get(privateMission.criterion.rightContainerId);
    if (!left || !right || left.id === right.id) {
      throw new Error("Compare Patches requires two distinct authoritative patches.");
    }
    const leftCount = state.items.filter((item) => item.containerId === left.id).length;
    const rightCount = state.items.filter((item) => item.containerId === right.id).length;
    if (leftCount !== publicMission.startingCounts.left || rightCount !== publicMission.startingCounts.right) {
      throw new Error("Compare Patches public counts do not match the constructed garden state.");
    }
    const expectedRelation = leftCount === rightCount ? "same" : leftCount > rightCount ? "left_more" : "right_more";
    if (privateMission.criterion.relation !== expectedRelation) {
      throw new Error("Compare Patches authoritative relationship contradicts the visible quantities.");
    }
  }

  return { publicMission, privateMission, state };
}
