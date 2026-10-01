export type NarrativeFlagValue = string | number | boolean;

export type StoryCondition =
  | { type: "has-evidence"; evidenceId: string }
  | { type: "missing-evidence"; evidenceId: string }
  | { type: "flag-equals"; flag: string; value: NarrativeFlagValue }
  | { type: "visited"; nodeId: string }
  | { type: "not-visited"; nodeId: string };

export type StoryEffect =
  | { type: "grant-evidence"; evidenceId: string }
  | { type: "set-flag"; flag: string; value: NarrativeFlagValue }
  | { type: "increment-flag"; flag: string; amount: number };

export type StoryChoice = {
  id: string;
  label: string;
  nextNodeId: string;
  conditions?: StoryCondition[];
  effects?: StoryEffect[];
  consequenceHint?: string;
};

export type StoryNode = {
  id: string;
  title: string;
  body: string;
  speaker?: string;
  nextNodeId?: string;
  choices?: StoryChoice[];
  grantEvidenceIds?: string[];
  endingId?: string;
};

export type BranchingStoryDefinition = {
  id: string;
  version: number;
  title: string;
  startNodeId: string;
  nodes: StoryNode[];
};

export type StoryChoiceRecord = {
  nodeId: string;
  choiceId: string;
};

export type BranchingStoryState = {
  storyId: string;
  storyVersion: number;
  nodeId: string;
  visitedNodeIds: string[];
  evidenceIds: string[];
  flags: Record<string, NarrativeFlagValue>;
  choiceHistory: StoryChoiceRecord[];
  endingId: string | null;
};

export type StoryTransition = {
  state: BranchingStoryState;
  node: StoryNode;
  newlyGrantedEvidenceIds: string[];
};

const CHECKPOINT_SCHEMA_VERSION = 1;

function nodeById(story: BranchingStoryDefinition, nodeId: string) {
  const node = story.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Story ${story.id} references missing node ${nodeId}.`);
  return node;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function enterNode(
  story: BranchingStoryDefinition,
  previous: BranchingStoryState,
  nodeId: string,
): StoryTransition {
  const node = nodeById(story, nodeId);
  const firstVisit = !previous.visitedNodeIds.includes(node.id);
  const grants = firstVisit ? node.grantEvidenceIds ?? [] : [];
  const next: BranchingStoryState = {
    ...previous,
    nodeId: node.id,
    visitedNodeIds: unique([...previous.visitedNodeIds, node.id]),
    evidenceIds: unique([...previous.evidenceIds, ...grants]),
    endingId: node.endingId ?? previous.endingId,
  };
  return { state: next, node, newlyGrantedEvidenceIds: grants.filter((id) => !previous.evidenceIds.includes(id)) };
}

export function validateBranchingStory(story: BranchingStoryDefinition) {
  const ids = new Set<string>();
  const problems: string[] = [];
  for (const node of story.nodes) {
    if (ids.has(node.id)) problems.push(`Duplicate node id ${node.id}.`);
    ids.add(node.id);
  }
  if (!ids.has(story.startNodeId)) problems.push(`Missing start node ${story.startNodeId}.`);
  for (const node of story.nodes) {
    if (node.nextNodeId && !ids.has(node.nextNodeId)) problems.push(`${node.id} points to missing ${node.nextNodeId}.`);
    const choiceIds = new Set<string>();
    for (const choice of node.choices ?? []) {
      if (choiceIds.has(choice.id)) problems.push(`${node.id} has duplicate choice ${choice.id}.`);
      choiceIds.add(choice.id);
      if (!ids.has(choice.nextNodeId)) problems.push(`${node.id}/${choice.id} points to missing ${choice.nextNodeId}.`);
    }
  }
  return { valid: problems.length === 0, problems };
}

export function createBranchingStoryState(story: BranchingStoryDefinition): BranchingStoryState {
  const validation = validateBranchingStory(story);
  if (!validation.valid) throw new Error(validation.problems.join(" "));
  const empty: BranchingStoryState = {
    storyId: story.id,
    storyVersion: story.version,
    nodeId: story.startNodeId,
    visitedNodeIds: [],
    evidenceIds: [],
    flags: {},
    choiceHistory: [],
    endingId: null,
  };
  return enterNode(story, empty, story.startNodeId).state;
}

export function currentStoryNode(story: BranchingStoryDefinition, state: BranchingStoryState) {
  return nodeById(story, state.nodeId);
}

export function storyConditionMet(condition: StoryCondition, state: BranchingStoryState) {
  if (condition.type === "has-evidence") return state.evidenceIds.includes(condition.evidenceId);
  if (condition.type === "missing-evidence") return !state.evidenceIds.includes(condition.evidenceId);
  if (condition.type === "visited") return state.visitedNodeIds.includes(condition.nodeId);
  if (condition.type === "not-visited") return !state.visitedNodeIds.includes(condition.nodeId);
  return state.flags[condition.flag] === condition.value;
}

export function availableStoryChoices(story: BranchingStoryDefinition, state: BranchingStoryState) {
  const node = currentStoryNode(story, state);
  return (node.choices ?? []).filter((choice) => (choice.conditions ?? []).every((condition) => storyConditionMet(condition, state)));
}

function applyEffects(state: BranchingStoryState, effects: StoryEffect[] = []) {
  let next = state;
  for (const effect of effects) {
    if (effect.type === "grant-evidence") {
      next = { ...next, evidenceIds: unique([...next.evidenceIds, effect.evidenceId]) };
      continue;
    }
    if (effect.type === "set-flag") {
      next = { ...next, flags: { ...next.flags, [effect.flag]: effect.value } };
      continue;
    }
    const previousValue = typeof next.flags[effect.flag] === "number" ? Number(next.flags[effect.flag]) : 0;
    next = { ...next, flags: { ...next.flags, [effect.flag]: previousValue + effect.amount } };
  }
  return next;
}

export function chooseStoryOption(
  story: BranchingStoryDefinition,
  state: BranchingStoryState,
  choiceId: string,
): StoryTransition {
  if (state.endingId) throw new Error("Cannot choose an option after the story has ended.");
  const node = currentStoryNode(story, state);
  const choice = availableStoryChoices(story, state).find((candidate) => candidate.id === choiceId);
  if (!choice) throw new Error(`Choice ${choiceId} is not available at node ${node.id}.`);
  const effected = applyEffects(state, choice.effects);
  const withHistory: BranchingStoryState = {
    ...effected,
    choiceHistory: [...effected.choiceHistory, { nodeId: node.id, choiceId: choice.id }],
  };
  return enterNode(story, withHistory, choice.nextNodeId);
}

export function continueStory(story: BranchingStoryDefinition, state: BranchingStoryState): StoryTransition {
  if (state.endingId) throw new Error("Cannot continue after the story has ended.");
  const node = currentStoryNode(story, state);
  if (!node.nextNodeId) throw new Error(`Node ${node.id} has no automatic continuation.`);
  return enterNode(story, state, node.nextNodeId);
}

export function serializeStoryCheckpoint(state: BranchingStoryState) {
  return JSON.stringify({ schemaVersion: CHECKPOINT_SCHEMA_VERSION, state });
}

export function restoreStoryCheckpoint(story: BranchingStoryDefinition, serialized: string | null | undefined) {
  if (!serialized) return { state: createBranchingStoryState(story), restored: false, reason: "empty" as const };
  try {
    const parsed = JSON.parse(serialized) as { schemaVersion?: number; state?: Partial<BranchingStoryState> };
    const candidate = parsed.state;
    if (parsed.schemaVersion !== CHECKPOINT_SCHEMA_VERSION || !candidate) throw new Error("schema");
    if (candidate.storyId !== story.id || candidate.storyVersion !== story.version) throw new Error("version");
    if (!candidate.nodeId || !story.nodes.some((node) => node.id === candidate.nodeId)) throw new Error("node");
    const state: BranchingStoryState = {
      storyId: story.id,
      storyVersion: story.version,
      nodeId: candidate.nodeId,
      visitedNodeIds: unique(Array.isArray(candidate.visitedNodeIds) ? candidate.visitedNodeIds.filter((id): id is string => typeof id === "string") : []),
      evidenceIds: unique(Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds.filter((id): id is string => typeof id === "string") : []),
      flags: candidate.flags && typeof candidate.flags === "object" ? candidate.flags as Record<string, NarrativeFlagValue> : {},
      choiceHistory: Array.isArray(candidate.choiceHistory)
        ? candidate.choiceHistory.filter((record): record is StoryChoiceRecord => Boolean(record && typeof record.nodeId === "string" && typeof record.choiceId === "string"))
        : [],
      endingId: typeof candidate.endingId === "string" ? candidate.endingId : null,
    };
    if (!state.visitedNodeIds.includes(state.nodeId)) state.visitedNodeIds = [...state.visitedNodeIds, state.nodeId];
    return { state, restored: true, reason: "restored" as const };
  } catch {
    return { state: createBranchingStoryState(story), restored: false, reason: "invalid" as const };
  }
}
