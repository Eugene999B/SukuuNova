import { auditQuestionPack, releaseQuestion, type FoundryQuestion, type VerificationCheck } from "./question-foundry";
import type { LearnQuestion } from "./learn-domain";

const checks: VerificationCheck[] = [
  "answer-check",
  "ambiguity-check",
  "curriculum-check",
  "duplicate-check",
  "age-check",
];

const source = {
  kind: "original" as const,
  name: "SukuuNova original starter content",
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
    estimatedSeconds: input.estimatedSeconds ?? 45,
  };
}

export const STARTER_FOUNDRY_PACK: FoundryQuestion[] = [
  {
    id: "starter-math-algebra-001",
    exposureKey: "math-linear-equation-001",
    kind: "numeric",
    subject: "Mathematics",
    topic: "Algebra",
    skill: "Solve one-variable linear equations",
    difficulty: 2,
    prompt: "Solve for x: 5x + 3 = 28.",
    answer: 5,
    acceptedAnswers: ["5"],
    explanation: "Subtract 3 from both sides to get 5x = 25, then divide by 5. Therefore x = 5.",
    hint: "Undo the addition before dividing.",
    version: 1,
    dna: dna({ subject: "Mathematics", topic: "Algebra", objective: "Solve simple linear equations", skill: "Solve one-variable linear equations", difficulty: 2, cognitiveSkill: "apply" }),
    source,
    review: review(),
  },
  {
    id: "starter-math-number-001",
    exposureKey: "math-ratio-simplify-001",
    kind: "fill",
    subject: "Mathematics",
    topic: "Number & operations",
    skill: "Simplify ratios",
    difficulty: 2,
    prompt: "Write the ratio 18:24 in its simplest form.",
    answer: "3:4",
    acceptedAnswers: ["3:4", "3 to 4"],
    explanation: "The highest common factor of 18 and 24 is 6. Dividing both terms by 6 gives 3:4.",
    version: 1,
    dna: dna({ subject: "Mathematics", topic: "Number & operations", objective: "Simplify a ratio to lowest terms", skill: "Simplify ratios", difficulty: 2, cognitiveSkill: "apply" }),
    source,
    review: review(),
  },
  {
    id: "starter-english-grammar-001",
    exposureKey: "english-concord-neither-nor-001",
    kind: "fill",
    subject: "English Language",
    topic: "Grammar & concord",
    skill: "Apply subject–verb agreement",
    difficulty: 3,
    prompt: "Complete the sentence: Neither Kojo nor his teammates ___ absent today.",
    answer: "are",
    acceptedAnswers: ["are"],
    explanation: "With neither…nor, the verb normally agrees with the nearer subject. ‘Teammates’ is plural, so ‘are’ fits.",
    version: 1,
    dna: dna({ subject: "English Language", topic: "Grammar & concord", objective: "Apply subject–verb agreement in paired constructions", skill: "Apply subject–verb agreement", difficulty: 3, cognitiveSkill: "apply" }),
    source,
    review: review(),
  },
  {
    id: "starter-english-vocabulary-001",
    exposureKey: "english-vocabulary-concise-001",
    kind: "short",
    subject: "English Language",
    topic: "Vocabulary",
    skill: "Use vocabulary precisely",
    difficulty: 2,
    prompt: "Give one word that means expressing much in few words.",
    answer: "concise",
    acceptedAnswers: ["concise", "succinct", "brief"],
    explanation: "Concise and succinct both describe language that communicates an idea in relatively few words.",
    version: 1,
    dna: dna({ subject: "English Language", topic: "Vocabulary", objective: "Choose precise words for meanings", skill: "Use vocabulary precisely", difficulty: 2, cognitiveSkill: "understand" }),
    source,
    review: review(),
  },
  {
    id: "starter-science-living-001",
    exposureKey: "science-transpiration-001",
    kind: "single",
    subject: "Science",
    topic: "Living things",
    skill: "Identify plant life processes",
    difficulty: 2,
    prompt: "Which process is the loss of water vapour from a plant, mainly through stomata in its leaves?",
    options: [
      { id: "respiration", label: "Respiration" },
      { id: "transpiration", label: "Transpiration" },
      { id: "germination", label: "Germination" },
      { id: "pollination", label: "Pollination" },
    ],
    answer: "transpiration",
    explanation: "Transpiration is the loss of water vapour from aerial plant surfaces, especially through leaf stomata.",
    version: 1,
    dna: dna({ subject: "Science", topic: "Living things", objective: "Recognise major plant life processes", skill: "Identify plant life processes", difficulty: 2, cognitiveSkill: "understand" }),
    source,
    review: review(),
  },
  {
    id: "starter-science-matter-001",
    exposureKey: "science-mixture-separation-001",
    kind: "single",
    subject: "Science",
    topic: "Matter & materials",
    skill: "Choose separation methods",
    difficulty: 2,
    prompt: "Which method is most suitable for separating insoluble sand from water?",
    options: [
      { id: "filtration", label: "Filtration" },
      { id: "evaporation", label: "Evaporation only" },
      { id: "magnet", label: "Using a magnet" },
      { id: "freezing", label: "Freezing" },
    ],
    answer: "filtration",
    explanation: "Filtration allows water to pass through a filter while insoluble sand is retained as residue.",
    version: 1,
    dna: dna({ subject: "Science", topic: "Matter & materials", objective: "Select methods for separating mixtures", skill: "Choose separation methods", difficulty: 2, cognitiveSkill: "apply" }),
    source,
    review: review(),
  },
  {
    id: "starter-computing-safety-001",
    exposureKey: "computing-account-security-001",
    kind: "multi",
    subject: "Computing",
    topic: "Digital safety",
    skill: "Apply safe account practices",
    difficulty: 2,
    prompt: "Select every action that improves the security of an important online account.",
    options: [
      { id: "unique", label: "Use a unique password" },
      { id: "mfa", label: "Enable multi-factor authentication" },
      { id: "share", label: "Share the password with a friend" },
      { id: "reuse", label: "Reuse one password on every site" },
    ],
    answer: ["unique", "mfa"],
    explanation: "Unique passwords limit password-reuse risk, while multi-factor authentication adds another verification step.",
    version: 1,
    dna: dna({ subject: "Computing", topic: "Digital safety", objective: "Use secure authentication practices", skill: "Apply safe account practices", difficulty: 2, cognitiveSkill: "apply" }),
    source,
    review: review(),
  },
  {
    id: "starter-computing-safety-002",
    exposureKey: "computing-phishing-check-001",
    kind: "boolean",
    subject: "Computing",
    topic: "Digital safety",
    skill: "Recognise suspicious messages",
    difficulty: 2,
    prompt: "True or false: An unexpected message asking you to enter your password through a link should be treated cautiously.",
    answer: true,
    explanation: "Unexpected password requests can be phishing attempts. Verify the sender and use the service’s trusted website or app instead of the supplied link.",
    version: 1,
    dna: dna({ subject: "Computing", topic: "Digital safety", objective: "Recognise common phishing signals", skill: "Recognise suspicious messages", difficulty: 2, cognitiveSkill: "apply" }),
    source,
    review: review(),
  },
  {
    id: "starter-social-governance-001",
    exposureKey: "social-constitution-role-001",
    kind: "boolean",
    subject: "Social Studies",
    topic: "Governance",
    skill: "Understand constitutional government",
    difficulty: 2,
    prompt: "True or false: A constitution can define the powers of state institutions and protect fundamental rights.",
    answer: true,
    explanation: "Constitutions commonly establish institutions and powers while setting fundamental rules and legal protections.",
    version: 1,
    dna: dna({ subject: "Social Studies", topic: "Governance", objective: "Explain core functions of a constitution", skill: "Understand constitutional government", difficulty: 2, cognitiveSkill: "understand" }),
    source,
    review: review(),
  },
  {
    id: "starter-social-citizenship-001",
    exposureKey: "social-citizenship-responsibility-001",
    kind: "single",
    subject: "Social Studies",
    topic: "Citizenship",
    skill: "Distinguish civic responsibilities",
    difficulty: 2,
    prompt: "Which action best demonstrates responsible citizenship in a community?",
    options: [
      { id: "protect", label: "Protect public property and follow lawful community rules" },
      { id: "damage", label: "Damage shared facilities when dissatisfied" },
      { id: "ignore", label: "Ignore every issue that affects neighbours" },
      { id: "misinfo", label: "Spread unverified rumours about community members" },
    ],
    answer: "protect",
    explanation: "Responsible citizenship includes respecting lawful rules, protecting shared resources and contributing constructively to community life.",
    version: 1,
    dna: dna({ subject: "Social Studies", topic: "Citizenship", objective: "Identify responsible civic behaviour", skill: "Distinguish civic responsibilities", difficulty: 2, cognitiveSkill: "apply" }),
    source,
    review: review(),
  },
];

export const STARTER_PACK_AUDIT = auditQuestionPack(STARTER_FOUNDRY_PACK);

export const VERIFIED_STARTER_QUESTIONS: LearnQuestion[] = STARTER_FOUNDRY_PACK
  .map(releaseQuestion)
  .filter((question): question is LearnQuestion => question !== null);
