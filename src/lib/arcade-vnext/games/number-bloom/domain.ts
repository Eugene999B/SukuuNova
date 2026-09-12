import { z } from "zod";

const id = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/i);
const slot = z.number().int().min(0).max(11);

export const numberBloomMechanicSchema = z.enum([
  "plant_count",
  "make_bed",
  "compare_patches",
  "free_grow",
]);
export type NumberBloomMechanic = z.infer<typeof numberBloomMechanicSchema>;

export const numberBloomObjectKindSchema = z.enum(["seed", "flower", "ladybird"]);
export type NumberBloomObjectKind = z.infer<typeof numberBloomObjectKindSchema>;

export const numberBloomRelationSchema = z.enum(["left_more", "right_more", "same"]);
export type NumberBloomRelation = z.infer<typeof numberBloomRelationSchema>;

export const numberBloomContainerSchema = z.object({
  id,
  role: z.enum(["bed", "patch", "basket"]),
  side: z.enum(["left", "right", "center"]).optional(),
  capacity: z.number().int().min(1).max(12),
}).strict();
export type NumberBloomContainer = z.infer<typeof numberBloomContainerSchema>;

const instructionSchema = z.object({
  spoken: z.string().min(1).max(160),
  replayable: z.literal(true),
  pictureCue: z.enum(["seed", "beds", "compare", "watering-can"]),
}).strict();

const publicBase = {
  missionId: id,
  title: z.string().min(1).max(80),
  instruction: instructionSchema,
  containers: z.array(numberBloomContainerSchema).min(1).max(3),
  objectKind: numberBloomObjectKindSchema,
  inventoryCount: z.number().int().min(1).max(20),
} as const;

const plantCountPublicSchema = z.object({
  ...publicBase,
  mechanic: z.literal("plant_count"),
  targetCount: z.number().int().min(1).max(5),
}).strict();

const makeBedPublicSchema = z.object({
  ...publicBase,
  mechanic: z.literal("make_bed"),
  targetTotal: z.number().int().min(2).max(10),
}).strict();

const comparePatchesPublicSchema = z.object({
  ...publicBase,
  mechanic: z.literal("compare_patches"),
  startingCounts: z.object({
    left: z.number().int().min(1).max(8),
    right: z.number().int().min(1).max(8),
  }).strict(),
}).strict();

const freeGrowPublicSchema = z.object({
  ...publicBase,
  mechanic: z.literal("free_grow"),
  ungraded: z.literal(true),
}).strict();

export const numberBloomPublicMissionSchema = z.discriminatedUnion("mechanic", [
  plantCountPublicSchema,
  makeBedPublicSchema,
  comparePatchesPublicSchema,
  freeGrowPublicSchema,
]);
export type NumberBloomPublicMission = z.infer<typeof numberBloomPublicMissionSchema>;

const plantCountPrivateSchema = z.object({
  mechanic: z.literal("plant_count"),
  criterion: z.object({
    kind: z.literal("exact_count"),
    containerId: id,
    targetCount: z.number().int().min(1).max(5),
  }).strict(),
}).strict();

const makeBedPrivateSchema = z.object({
  mechanic: z.literal("make_bed"),
  criterion: z.object({
    kind: z.literal("sum_across"),
    containerIds: z.array(id).length(2),
    targetTotal: z.number().int().min(2).max(10),
    minimumOccupiedBeds: z.number().int().min(1).max(2),
  }).strict(),
}).strict();

const comparePatchesPrivateSchema = z.object({
  mechanic: z.literal("compare_patches"),
  criterion: z.object({
    kind: z.literal("paired_relation"),
    leftContainerId: id,
    rightContainerId: id,
    relation: numberBloomRelationSchema,
  }).strict(),
}).strict();

const freeGrowPrivateSchema = z.object({
  mechanic: z.literal("free_grow"),
  criterion: z.object({ kind: z.literal("ungraded") }).strict(),
}).strict();

export const numberBloomPrivateMissionSchema = z.discriminatedUnion("mechanic", [
  plantCountPrivateSchema,
  makeBedPrivateSchema,
  comparePatchesPrivateSchema,
  freeGrowPrivateSchema,
]);
export type NumberBloomPrivateMission = z.infer<typeof numberBloomPrivateMissionSchema>;

export const numberBloomItemStateSchema = z.object({
  id,
  kind: numberBloomObjectKindSchema,
  containerId: id.nullable(),
  slot: slot.nullable(),
}).strict();
export type NumberBloomItemState = z.infer<typeof numberBloomItemStateSchema>;

const pairSchema = z.object({
  leftItemId: id,
  rightItemId: id,
}).strict();

export const numberBloomStateSchema = z.object({
  items: z.array(numberBloomItemStateSchema).min(1).max(24),
  pairs: z.array(pairSchema).max(12),
  relationship: numberBloomRelationSchema.nullable(),
  wateredContainers: z.array(id).max(12),
  interactionCount: z.number().int().nonnegative(),
  selfCorrections: z.number().int().nonnegative(),
  supportRequests: z.number().int().nonnegative(),
}).strict().superRefine((state, ctx) => {
  const itemIds = new Set<string>();
  const placements = new Set<string>();
  for (const item of state.items) {
    if (itemIds.has(item.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate item id: ${item.id}` });
    }
    itemIds.add(item.id);
    if ((item.containerId === null) !== (item.slot === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Item ${item.id} must have both containerId and slot, or neither.` });
    }
    if (item.containerId !== null && item.slot !== null) {
      const key = `${item.containerId}:${item.slot}`;
      if (placements.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate placement: ${key}` });
      }
      placements.add(key);
    }
  }

  const paired = new Set<string>();
  for (const pair of state.pairs) {
    if (!itemIds.has(pair.leftItemId) || !itemIds.has(pair.rightItemId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pair references an unknown item." });
    }
    if (pair.leftItemId === pair.rightItemId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An item cannot be paired with itself." });
    }
    if (paired.has(pair.leftItemId) || paired.has(pair.rightItemId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An item can belong to only one comparison pair." });
    }
    paired.add(pair.leftItemId);
    paired.add(pair.rightItemId);
  }
});
export type NumberBloomState = z.infer<typeof numberBloomStateSchema>;

const placementPayloadSchema = z.object({ itemId: id, containerId: id, slot }).strict();
const removePayloadSchema = z.object({ itemId: id }).strict();
const pairPayloadSchema = z.object({ leftItemId: id, rightItemId: id }).strict();
const unpairPayloadSchema = z.object({ itemId: id }).strict();
const relationshipPayloadSchema = z.object({ relation: numberBloomRelationSchema }).strict();
const waterPayloadSchema = z.object({ containerId: id }).strict();
const supportPayloadSchema = z.object({ kind: z.enum(["replay", "count_along", "pair_helper"]) }).strict();

export type NumberBloomAction =
  | { kind: "place" | "move"; itemId: string; containerId: string; slot: number }
  | { kind: "remove"; itemId: string }
  | { kind: "pair"; leftItemId: string; rightItemId: string }
  | { kind: "unpair"; itemId: string }
  | { kind: "set_relationship"; relation: NumberBloomRelation }
  | { kind: "water"; containerId: string }
  | { kind: "support"; supportKind: "replay" | "count_along" | "pair_helper" };

export function parseNumberBloomAction(actionType: string, payload: unknown): NumberBloomAction {
  if (actionType === "place" || actionType === "move") {
    return { kind: actionType, ...placementPayloadSchema.parse(payload) };
  }
  if (actionType === "remove") return { kind: "remove", ...removePayloadSchema.parse(payload) };
  if (actionType === "pair") return { kind: "pair", ...pairPayloadSchema.parse(payload) };
  if (actionType === "unpair") return { kind: "unpair", ...unpairPayloadSchema.parse(payload) };
  if (actionType === "set_relationship") {
    return { kind: "set_relationship", ...relationshipPayloadSchema.parse(payload) };
  }
  if (actionType === "water") return { kind: "water", ...waterPayloadSchema.parse(payload) };
  if (actionType === "support") {
    const parsed = supportPayloadSchema.parse(payload);
    return { kind: "support", supportKind: parsed.kind };
  }
  throw new Error(`Unsupported Number Bloom action type: ${actionType}`);
}

function stableIndex(input: string, modulo: number) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  return hash % modulo;
}

function makeItems(kind: NumberBloomObjectKind, count: number): NumberBloomItemState[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${index + 1}`,
    kind,
    containerId: null,
    slot: null,
  }));
}

function placeStartingItems(
  items: NumberBloomItemState[],
  containerId: string,
  startIndex: number,
  count: number,
) {
  for (let offset = 0; offset < count; offset += 1) {
    const item = items[startIndex + offset];
    if (!item) throw new Error("Number Bloom mission requested more starting objects than inventory contains.");
    item.containerId = containerId;
    item.slot = offset;
  }
}

function initialState(items: NumberBloomItemState[]): NumberBloomState {
  return numberBloomStateSchema.parse({
    items,
    pairs: [],
    relationship: null,
    wateredContainers: [],
    interactionCount: 0,
    selfCorrections: 0,
    supportRequests: 0,
  });
}

export type NumberBloomMissionBundle = {
  publicMission: NumberBloomPublicMission;
  privateMission: NumberBloomPrivateMission;
  initialState: NumberBloomState;
};

export function buildNumberBloomMission(mechanic: NumberBloomMechanic, variant = 0): NumberBloomMissionBundle {
  const safeVariant = Math.max(0, Math.trunc(variant));

  if (mechanic === "plant_count") {
    const targets = [3, 4, 5] as const;
    const targetCount = targets[safeVariant % targets.length] ?? 3;
    const bed = { id: "plant-bed", role: "bed" as const, side: "center" as const, capacity: 6 };
    const items = makeItems("seed", 6);
    return {
      publicMission: numberBloomPublicMissionSchema.parse({
        missionId: `plant-count-${targetCount}`,
        mechanic,
        title: "Plant Count",
        instruction: { spoken: `Plant ${targetCount} seeds.`, replayable: true, pictureCue: "seed" },
        containers: [bed],
        objectKind: "seed",
        inventoryCount: items.length,
        targetCount,
      }),
      privateMission: numberBloomPrivateMissionSchema.parse({
        mechanic,
        criterion: { kind: "exact_count", containerId: bed.id, targetCount },
      }),
      initialState: initialState(items),
    };
  }

  if (mechanic === "make_bed") {
    const targets = [5, 6, 7] as const;
    const targetTotal = targets[safeVariant % targets.length] ?? 5;
    const left = { id: "make-left", role: "bed" as const, side: "left" as const, capacity: 7 };
    const right = { id: "make-right", role: "bed" as const, side: "right" as const, capacity: 7 };
    const items = makeItems("flower", targetTotal + 2);
    const startingLeft = Math.max(1, targetTotal - 2);
    placeStartingItems(items, left.id, 0, startingLeft);
    return {
      publicMission: numberBloomPublicMissionSchema.parse({
        missionId: `make-bed-${targetTotal}`,
        mechanic,
        title: "Make the Bed",
        instruction: { spoken: `Make ${targetTotal} flowers across the two beds.`, replayable: true, pictureCue: "beds" },
        containers: [left, right],
        objectKind: "flower",
        inventoryCount: items.length,
        targetTotal,
      }),
      privateMission: numberBloomPrivateMissionSchema.parse({
        mechanic,
        criterion: {
          kind: "sum_across",
          containerIds: [left.id, right.id],
          targetTotal,
          minimumOccupiedBeds: 2,
        },
      }),
      initialState: initialState(items),
    };
  }

  if (mechanic === "compare_patches") {
    const variants = [
      { left: 4, right: 2 },
      { left: 3, right: 5 },
      { left: 4, right: 4 },
    ] as const;
    const counts = variants[safeVariant % variants.length] ?? variants[0];
    const left = { id: "compare-left", role: "patch" as const, side: "left" as const, capacity: 8 };
    const right = { id: "compare-right", role: "patch" as const, side: "right" as const, capacity: 8 };
    const items = makeItems("flower", counts.left + counts.right);
    placeStartingItems(items, left.id, 0, counts.left);
    placeStartingItems(items, right.id, counts.left, counts.right);
    const relation: NumberBloomRelation = counts.left === counts.right ? "same" : counts.left > counts.right ? "left_more" : "right_more";
    return {
      publicMission: numberBloomPublicMissionSchema.parse({
        missionId: `compare-${counts.left}-${counts.right}`,
        mechanic,
        title: "Compare Patches",
        instruction: { spoken: "Pair the flowers, then show which patch has more, or if they are the same.", replayable: true, pictureCue: "compare" },
        containers: [left, right],
        objectKind: "flower",
        inventoryCount: items.length,
        startingCounts: counts,
      }),
      privateMission: numberBloomPrivateMissionSchema.parse({
        mechanic,
        criterion: {
          kind: "paired_relation",
          leftContainerId: left.id,
          rightContainerId: right.id,
          relation,
        },
      }),
      initialState: initialState(items),
    };
  }

  const bed = { id: "free-bed", role: "bed" as const, side: "center" as const, capacity: 10 };
  const items = makeItems("seed", 10);
  return {
    publicMission: numberBloomPublicMissionSchema.parse({
      missionId: `free-grow-${safeVariant % 3}`,
      mechanic: "free_grow",
      title: "Free Grow",
      instruction: { spoken: "Grow anything you like.", replayable: true, pictureCue: "watering-can" },
      containers: [bed],
      objectKind: "seed",
      inventoryCount: items.length,
      ungraded: true,
    }),
    privateMission: numberBloomPrivateMissionSchema.parse({
      mechanic: "free_grow",
      criterion: { kind: "ungraded" },
    }),
    initialState: initialState(items),
  };
}

export function selectNumberBloomMission(studentId: string): NumberBloomMissionBundle {
  const mechanics: NumberBloomMechanic[] = ["plant_count", "make_bed", "compare_patches"];
  const index = stableIndex(studentId, mechanics.length);
  return buildNumberBloomMission(mechanics[index] ?? "plant_count", stableIndex(`${studentId}:variant`, 3));
}

function containerMap(publicMission: NumberBloomPublicMission) {
  return new Map(publicMission.containers.map((container) => [container.id, container]));
}

function itemMap(state: NumberBloomState) {
  return new Map(state.items.map((item) => [item.id, item]));
}

function countIn(state: NumberBloomState, containerId: string) {
  return state.items.filter((item) => item.containerId === containerId).length;
}

function stripPairsForItem(pairs: NumberBloomState["pairs"], itemId: string) {
  return pairs.filter((pair) => pair.leftItemId !== itemId && pair.rightItemId !== itemId);
}

export function applyNumberBloomAction(
  publicMissionInput: unknown,
  stateInput: unknown,
  action: NumberBloomAction,
): NumberBloomState {
  const publicMission = numberBloomPublicMissionSchema.parse(publicMissionInput);
  const current = numberBloomStateSchema.parse(stateInput);
  const containers = containerMap(publicMission);
  const items = current.items.map((item) => ({ ...item }));
  const byId = itemMap({ ...current, items });
  let pairs = current.pairs.map((pair) => ({ ...pair }));
  let relationship = current.relationship;
  let wateredContainers = [...current.wateredContainers];
  let selfCorrections = current.selfCorrections;
  let supportRequests = current.supportRequests;

  if (action.kind === "place" || action.kind === "move") {
    const item = byId.get(action.itemId);
    const container = containers.get(action.containerId);
    if (!item) throw new Error(`Unknown Number Bloom item: ${action.itemId}`);
    if (!container) throw new Error(`Unknown Number Bloom container: ${action.containerId}`);
    if (action.slot >= container.capacity) throw new Error(`Slot ${action.slot} exceeds ${container.id} capacity.`);
    const occupied = items.find((candidate) => candidate.containerId === container.id && candidate.slot === action.slot && candidate.id !== item.id);
    if (occupied) throw new Error(`Slot ${container.id}:${action.slot} is already occupied.`);
    if (item.containerId !== null && (item.containerId !== container.id || item.slot !== action.slot)) selfCorrections += 1;
    item.containerId = container.id;
    item.slot = action.slot;
    pairs = stripPairsForItem(pairs, item.id);
    relationship = publicMission.mechanic === "compare_patches" ? null : relationship;
  } else if (action.kind === "remove") {
    const item = byId.get(action.itemId);
    if (!item) throw new Error(`Unknown Number Bloom item: ${action.itemId}`);
    if (item.containerId !== null) selfCorrections += 1;
    item.containerId = null;
    item.slot = null;
    pairs = stripPairsForItem(pairs, item.id);
    relationship = publicMission.mechanic === "compare_patches" ? null : relationship;
  } else if (action.kind === "pair") {
    if (publicMission.mechanic !== "compare_patches") throw new Error("Pairing is only available in Compare Patches.");
    const left = byId.get(action.leftItemId);
    const right = byId.get(action.rightItemId);
    const leftContainer = publicMission.containers.find((container) => container.side === "left");
    const rightContainer = publicMission.containers.find((container) => container.side === "right");
    if (!left || !right || !leftContainer || !rightContainer) throw new Error("Comparison pair references unavailable objects.");
    if (left.containerId !== leftContainer.id || right.containerId !== rightContainer.id) {
      throw new Error("Comparison pairs must connect one object from each patch.");
    }
    pairs = stripPairsForItem(stripPairsForItem(pairs, left.id), right.id);
    pairs.push({ leftItemId: left.id, rightItemId: right.id });
  } else if (action.kind === "unpair") {
    pairs = stripPairsForItem(pairs, action.itemId);
  } else if (action.kind === "set_relationship") {
    if (publicMission.mechanic !== "compare_patches") throw new Error("Relationship markers are only available in Compare Patches.");
    relationship = action.relation;
  } else if (action.kind === "water") {
    if (!containers.has(action.containerId)) throw new Error(`Unknown Number Bloom container: ${action.containerId}`);
    if (!wateredContainers.includes(action.containerId)) wateredContainers.push(action.containerId);
  } else if (action.kind === "support") {
    supportRequests += 1;
  }

  return numberBloomStateSchema.parse({
    items,
    pairs,
    relationship,
    wateredContainers,
    interactionCount: current.interactionCount + 1,
    selfCorrections,
    supportRequests,
  });
}

export type NumberBloomEvaluation = {
  demonstrated: boolean;
  progress: number;
  misconception?: string;
  context: Record<string, unknown>;
};

export function evaluateNumberBloomState(
  privateMissionInput: unknown,
  stateInput: unknown,
): NumberBloomEvaluation {
  const privateMission = numberBloomPrivateMissionSchema.parse(privateMissionInput);
  const state = numberBloomStateSchema.parse(stateInput);

  if (privateMission.mechanic === "plant_count") {
    const actual = countIn(state, privateMission.criterion.containerId);
    const target = privateMission.criterion.targetCount;
    return {
      demonstrated: actual === target,
      progress: Math.min(1, actual / target),
      misconception: actual > target ? "overfilled_target_group" : undefined,
      context: { actual, target },
    };
  }

  if (privateMission.mechanic === "make_bed") {
    const counts = privateMission.criterion.containerIds.map((containerId) => countIn(state, containerId));
    const total = counts.reduce((sum, value) => sum + value, 0);
    const occupiedBeds = counts.filter((value) => value > 0).length;
    return {
      demonstrated: total === privateMission.criterion.targetTotal && occupiedBeds >= privateMission.criterion.minimumOccupiedBeds,
      progress: Math.min(1, total / privateMission.criterion.targetTotal),
      misconception: total > privateMission.criterion.targetTotal ? "composition_exceeds_target" : undefined,
      context: { counts, total, occupiedBeds, targetTotal: privateMission.criterion.targetTotal },
    };
  }

  if (privateMission.mechanic === "compare_patches") {
    const leftCount = countIn(state, privateMission.criterion.leftContainerId);
    const rightCount = countIn(state, privateMission.criterion.rightContainerId);
    const requiredPairs = Math.min(leftCount, rightCount);
    const pairedEnough = state.pairs.length >= requiredPairs;
    const relationCorrect = state.relationship === privateMission.criterion.relation;
    return {
      demonstrated: pairedEnough && relationCorrect,
      progress: requiredPairs === 0 ? 0 : Math.min(1, state.pairs.length / requiredPairs) * (relationCorrect ? 1 : 0.8),
      misconception: state.relationship !== null && !relationCorrect ? "comparison_relation_reversed" : undefined,
      context: { leftCount, rightCount, pairCount: state.pairs.length, requiredPairs, relationChosen: state.relationship },
    };
  }

  return {
    demonstrated: false,
    progress: 1,
    context: { ungraded: true, placed: state.items.filter((item) => item.containerId !== null).length },
  };
}
