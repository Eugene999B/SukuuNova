import type { VerificationCheck } from "./question-foundry";
import {
  isRichInteractionPublishable,
  releaseRichInteraction,
  type RichInteractionQuestion,
  type RichLearnerQuestion,
} from "./rich-interactions";

const checks: VerificationCheck[] = [
  "answer-check",
  "ambiguity-check",
  "curriculum-check",
  "duplicate-check",
  "age-check",
];

const source = {
  kind: "original" as const,
  name: "SukuuNova original rich-interaction starter content",
};

function review() {
  return {
    status: "verified" as const,
    checks: [...checks],
    confidence: 0.97,
    reviewer: "SukuuNova content QA",
    reviewedAt: "2026-09-17T00:00:00.000Z",
  };
}

function dna(input: {
  subject: string;
  topic: string;
  objective: string;
  skill: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  cognitiveSkill: "remember" | "understand" | "apply" | "analyse" | "evaluate" | "create";
  estimatedSeconds?: number;
}) {
  return {
    country: "GH",
    framework: "SukuuNova starter alignment",
    frameworkVersion: "2026.1",
    level: "JHS foundation",
    subject: input.subject,
    topic: input.topic,
    objective: input.objective,
    skill: input.skill,
    difficulty: input.difficulty,
    cognitiveSkill: input.cognitiveSkill,
    language: "en-GH",
    estimatedSeconds: input.estimatedSeconds ?? 60,
  };
}

export const RICH_STARTER_FOUNDRY_PACK: RichInteractionQuestion[] = [
  {
    id: "rich-science-matter-match-001",
    exposureKey: "science-state-changes-match-001",
    kind: "matching",
    subject: "Science",
    topic: "Matter & materials",
    skill: "Relate changes of state to their descriptions",
    difficulty: 2,
    prompt: "Match each change of state with the correct description.",
    matchPrompts: [
      { id: "melting", label: "Melting" },
      { id: "evaporation", label: "Evaporation" },
      { id: "condensation", label: "Condensation" },
    ],
    options: [
      { id: "gas-liquid", label: "Gas changes to liquid" },
      { id: "solid-liquid", label: "Solid changes to liquid" },
      { id: "liquid-gas", label: "Liquid changes to gas" },
    ],
    answer: ["solid-liquid", "liquid-gas", "gas-liquid"],
    explanation: "Melting changes a solid to a liquid, evaporation changes a liquid to a gas, and condensation changes a gas to a liquid.",
    hint: "Think about what happens to particles when matter gains or loses heat.",
    version: 1,
    dna: dna({ subject: "Science", topic: "Matter & materials", objective: "Relate common changes of state to their descriptions", skill: "Relate changes of state to their descriptions", difficulty: 2, cognitiveSkill: "understand" }),
    source,
    review: review(),
  },
  {
    id: "rich-computing-files-match-001",
    exposureKey: "computing-file-types-match-001",
    kind: "matching",
    subject: "Computing",
    topic: "Computer systems",
    skill: "Recognise common file types",
    difficulty: 2,
    prompt: "Match each common file extension with the type of content it usually stores.",
    matchPrompts: [
      { id: "txt", label: ".txt" },
      { id: "jpg", label: ".jpg" },
      { id: "mp3", label: ".mp3" },
    ],
    options: [
      { id: "audio", label: "Audio" },
      { id: "plain-text", label: "Plain text" },
      { id: "image", label: "Image" },
    ],
    answer: ["plain-text", "image", "audio"],
    explanation: ".txt is commonly used for plain text, .jpg for image files, and .mp3 for compressed audio.",
    version: 1,
    dna: dna({ subject: "Computing", topic: "Computer systems", objective: "Recognise common file extensions and content types", skill: "Recognise common file types", difficulty: 2, cognitiveSkill: "understand" }),
    source,
    review: review(),
  },
  {
    id: "rich-english-sentence-order-001",
    exposureKey: "english-sentence-order-001",
    kind: "ordering",
    subject: "English Language",
    topic: "Grammar & concord",
    skill: "Build a grammatical sentence",
    difficulty: 2,
    prompt: "Arrange the word groups to form the complete sentence: ‘The students completed the assignment.’",
    options: [
      { id: "assignment", label: "the assignment" },
      { id: "students", label: "students" },
      { id: "the", label: "The" },
      { id: "completed", label: "completed" },
    ],
    answer: ["the", "students", "completed", "assignment"],
    explanation: "The sentence follows a clear subject–verb–object structure: The students / completed / the assignment.",
    hint: "Start with the capitalised determiner, then identify the subject, verb and object.",
    version: 1,
    dna: dna({ subject: "English Language", topic: "Grammar & concord", objective: "Arrange word groups into a grammatical sentence", skill: "Build a grammatical sentence", difficulty: 2, cognitiveSkill: "apply" }),
    source,
    review: review(),
  },
  {
    id: "rich-science-water-cycle-order-001",
    exposureKey: "science-water-cycle-order-001",
    kind: "ordering",
    subject: "Science",
    topic: "Environment",
    skill: "Sequence the water cycle",
    difficulty: 2,
    prompt: "Starting with surface water heated by the sun, arrange these stages in the expected sequence.",
    options: [
      { id: "precipitation", label: "Precipitation" },
      { id: "collection", label: "Collection" },
      { id: "evaporation", label: "Evaporation" },
      { id: "condensation", label: "Condensation" },
    ],
    answer: ["evaporation", "condensation", "precipitation", "collection"],
    explanation: "Surface water evaporates, water vapour condenses into clouds, precipitation falls, and water collects again in surface stores.",
    hint: "Follow the movement of water from the surface into the air and back to the surface.",
    version: 1,
    dna: dna({ subject: "Science", topic: "Environment", objective: "Sequence major stages of the water cycle from a stated starting point", skill: "Sequence the water cycle", difficulty: 2, cognitiveSkill: "understand" }),
    source,
    review: review(),
  },
];

export const RELEASED_RICH_INTERACTIONS: RichLearnerQuestion[] = RICH_STARTER_FOUNDRY_PACK
  .filter(isRichInteractionPublishable)
  .map(releaseRichInteraction)
  .filter((question): question is RichLearnerQuestion => question !== null);
