import type { ArcadeV5GameKey } from "./arcade-v5-design";

export type ArcadePaceModel = "untimed" | "world-motion" | "skill-speed";
export type ArcadeResetStatus = "strong-base" | "foundation-reset" | "needs-core-rebuild";

export type ArcadeFlagshipQualityContract = {
  name: string;
  family: string;
  primaryInteraction: string;
  learningAction: string;
  pace: ArcadePaceModel;
  thinkingTimeMayDamageState: false;
  thinkingTimeMayReduceReward: false;
  genericChoiceGridAllowed: boolean;
  resetStatus: ArcadeResetStatus;
  redesignTarget: string;
};

/**
 * Product contract for every live Learning Arcade flagship.
 *
 * This is intentionally stricter than visual identity metadata: it describes what the
 * learner actually does. A new background, meter or story wrapper does not count as a
 * new mechanic. Thinking/reading time never damages progress or reduces rewards.
 */
export const ARCADE_FLAGSHIP_QUALITY: Record<ArcadeV5GameKey, ArcadeFlagshipQualityContract> = {
  math: {
    name: "Nova Runner",
    family: "Mathematics endless runner",
    primaryInteraction: "run-jump-route-gate",
    learningAction: "Use mathematics to open routes, trigger power-ups and make route decisions while running.",
    pace: "world-motion",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "strong-base",
    redesignTarget: "Keep continuous movement and make mathematics alter routes, hazards and power-ups more directly.",
  },
  "keyboard-ninja": {
    name: "TurboType",
    family: "Typing tournament",
    primaryInteraction: "live-keyboard-race",
    learningAction: "Type target text accurately while telemetry adapts practice to weak keys and rhythm.",
    pace: "skill-speed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "strong-base",
    redesignTarget: "Deepen tournaments, weak-key recovery and race variety without replacing real typing with choices.",
  },
  "force-motion-lab": {
    name: "AstroLab",
    family: "Physics survival laboratory",
    primaryInteraction: "manipulate-force-motion-experiment",
    learningAction: "Change force, direction, mass or motion variables and observe the station response.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "needs-core-rebuild",
    redesignTarget: "Replace response cards with direct force/motion controls, prediction, launch and measured outcomes.",
  },
  "circuit-logic": {
    name: "Circuit Forge",
    family: "Electrical engineering workshop",
    primaryInteraction: "wire-measure-test-repair",
    learningAction: "Wire components, place meters, test circuits and isolate faults before energising the grid.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "needs-core-rebuild",
    redesignTarget: "Make the circuit diagram interactive; construction and diagnosis must replace four-choice switch plans.",
  },
  word: {
    name: "Word Kingdom",
    family: "Fantasy language adventure",
    primaryInteraction: "collect-build-transform-words",
    learningAction: "Collect, arrange and transform words or sentence parts to change the story world.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "needs-core-rebuild",
    redesignTarget: "Replace rune-choice cards with word manipulation, sentence construction and explorable language encounters.",
  },
  "sentence-scramble": {
    name: "Animation Story Lab",
    family: "Creative animation studio",
    primaryInteraction: "storyboard-edit-preview",
    learningAction: "Build frames, sequence beats, edit dialogue and preview a short animation.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "strong-base",
    redesignTarget: "Keep Free Create and convert Director Missions toward direct sequencing, editing and shot construction.",
  },
  "comprehension-quest": {
    name: "Reading Quest",
    family: "Evidence reading expedition",
    primaryInteraction: "inspect-highlight-link-evidence",
    learningAction: "Inspect a passage, collect evidence and connect it to an inference or conclusion.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "needs-core-rebuild",
    redesignTarget: "Remove story-fog punishment and make passage evidence collection and inference assembly the core play.",
  },
  "coding-sequence": {
    name: "CodeBots",
    family: "Robot automation factory",
    primaryInteraction: "assemble-run-debug-program",
    learningAction: "Assemble command sequences, execute them, inspect failures and debug the robot program.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "strong-base",
    redesignTarget: "Keep the command rack, remove thinking-time heat penalties and deepen loops, conditions and execution feedback.",
  },
  "ghana-map-master": {
    name: "GeoQuest",
    family: "Interactive geography expedition",
    primaryInteraction: "map-pin-route-plot",
    learningAction: "Locate places directly on the map, plot routes and use spatial clues to navigate.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "needs-core-rebuild",
    redesignTarget: "Make map location and route plotting the graded interaction instead of choosing a label from four cards.",
  },
  "money-math-market": {
    name: "Cedi City",
    family: "Ghana cedi market simulation",
    primaryInteraction: "cash-basket-receipt-budget",
    learningAction: "Handle cedi values, build baskets and receipts, make change and allocate budgets directly.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "needs-core-rebuild",
    redesignTarget: "Replace receipt answer cards with manipulable money, till, basket, inventory and budget decisions.",
  },
  "cyber-safety": {
    name: "Signal Shield",
    family: "Defensive cyber operations",
    primaryInteraction: "inspect-trace-quarantine-recover",
    learningAction: "Inspect safe simulated signals, identify evidence, quarantine threats and choose recovery actions in sequence.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "needs-core-rebuild",
    redesignTarget: "Turn incident evidence into a multi-step defensive workflow instead of four response buttons.",
  },
  "environment-guardian": {
    name: "EcoGrid Ghana",
    family: "Environmental systems strategy",
    primaryInteraction: "allocate-place-balance-resources",
    learningAction: "Place projects and balance water, energy, waste, habitat and resilience across a community system.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "needs-core-rebuild",
    redesignTarget: "Remove elapsed-time eco damage and make resource allocation and system consequences drive play.",
  },
  "body-explorer": {
    name: "BioQuest",
    family: "Human systems exploration",
    primaryInteraction: "connect-organs-pathways-systems",
    learningAction: "Connect organs, pathways and body-system relationships in fictional educational cases.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "needs-core-rebuild",
    redesignTarget: "Remove strain-for-thinking and replace response cards with organ/system linking and pathway puzzles.",
  },
  "history-timeline": {
    name: "Chronicle Vault",
    family: "Historical evidence investigation",
    primaryInteraction: "order-compare-corroborate-sources",
    learningAction: "Assemble timelines, compare sources and corroborate evidence before a historical verdict.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "strong-base",
    redesignTarget: "Make ordering and source comparison dominant, and remove elapsed-time paradox damage.",
  },
  "culture-heritage": {
    name: "Style Studio Ghana",
    family: "Creative textile design studio",
    primaryInteraction: "compose-style-layer-design",
    learningAction: "Compose garments and patterns on a model, revise a design and respond to objective briefs.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "strong-base",
    redesignTarget: "Keep Free Style and make graded briefs use direct layer composition instead of selecting one wardrobe card.",
  },
  "space-explorer": {
    name: "Solar Navigator",
    family: "Astronomy mission control",
    primaryInteraction: "plot-route-burn-telemetry",
    learningAction: "Read telemetry, plot a route, allocate fuel and choose burns or orbital actions.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "needs-core-rebuild",
    redesignTarget: "Remove navigation damage from elapsed thinking and make route plotting/resource planning the core interaction.",
  },
  "number-pop": {
    name: "Number Bloom",
    family: "Early numeracy picture garden",
    primaryInteraction: "touch-count-group-compose",
    learningAction: "Touch, count, group and compose quantities directly with picture objects.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: false,
    resetStatus: "strong-base",
    redesignTarget: "Keep the calm garden and increase direct quantity manipulation so choices are not the main play.",
  },
  logic: {
    name: "Nova Millionaire",
    family: "Reasoning game show",
    primaryInteraction: "reason-select-lock-reveal",
    learningAction: "Solve varied reasoning scenes, use answer-neutral support, then deliberately lock a choice for secure reveal.",
    pace: "untimed",
    thinkingTimeMayDamageState: false,
    thinkingTimeMayReduceReward: false,
    genericChoiceGridAllowed: true,
    resetStatus: "foundation-reset",
    redesignTarget: "Preserve the game-show lock/reveal loop while continuing to expand scene, content and audiovisual variety.",
  },
};

export const ARCADE_LIVE_FLAGSHIP_COUNT = Object.keys(ARCADE_FLAGSHIP_QUALITY).length;

export function arcadeQualityContract(game: string) {
  return ARCADE_FLAGSHIP_QUALITY[game as ArcadeV5GameKey] ?? null;
}

export function arcadeThinkingTimeMayDamageState(game: string) {
  return arcadeQualityContract(game)?.thinkingTimeMayDamageState ?? false;
}

export function arcadeThinkingTimeMayReduceReward(game: string) {
  return arcadeQualityContract(game)?.thinkingTimeMayReduceReward ?? false;
}
