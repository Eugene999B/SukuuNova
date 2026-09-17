export type LearnLane = "school" | "exam" | "university" | "skills";
export type PracticeMode = "topic" | "adaptive" | "random" | "timed" | "weakness";
export type QuestionKind = "single" | "multi" | "fill" | "numeric" | "boolean" | "short";

export type CatalogTopic = {
  id: string;
  label: string;
};

export type CatalogSubject = {
  id: string;
  label: string;
  topics: CatalogTopic[];
};

export type CatalogLevel = {
  id: string;
  label: string;
  subjects: CatalogSubject[];
};

export type CatalogProgram = {
  id: string;
  label: string;
  description: string;
  levels: CatalogLevel[];
};

export type LearningCatalog = {
  id: LearnLane;
  label: string;
  programs: CatalogProgram[];
};

export type LearnQuestion = {
  id: string;
  exposureKey: string;
  kind: QuestionKind;
  subject: string;
  topic: string;
  skill: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  prompt: string;
  options?: { id: string; label: string }[];
  answer: string | string[] | number | boolean;
  acceptedAnswers?: string[];
  explanation: string;
  hint?: string;
};

export type SessionConfig = {
  lane: LearnLane;
  programId: string;
  levelId: string;
  subjectId: string;
  topicId: string;
  mode: PracticeMode;
  count: number;
  seen?: string[];
  seed?: number;
};

const schoolSubjects: CatalogSubject[] = [
  {
    id: "mathematics",
    label: "Mathematics",
    topics: [
      { id: "number", label: "Number & operations" },
      { id: "algebra", label: "Algebra" },
      { id: "geometry", label: "Geometry" },
      { id: "statistics", label: "Statistics & probability" },
    ],
  },
  {
    id: "english",
    label: "English Language",
    topics: [
      { id: "grammar", label: "Grammar & concord" },
      { id: "vocabulary", label: "Vocabulary" },
      { id: "reading", label: "Reading comprehension" },
      { id: "writing", label: "Writing" },
    ],
  },
  {
    id: "science",
    label: "Science",
    topics: [
      { id: "living", label: "Living things" },
      { id: "matter", label: "Matter & materials" },
      { id: "energy", label: "Force & energy" },
      { id: "environment", label: "Environment" },
    ],
  },
  {
    id: "social",
    label: "Social Studies",
    topics: [
      { id: "governance", label: "Governance" },
      { id: "citizenship", label: "Citizenship" },
      { id: "environment", label: "People & environment" },
      { id: "development", label: "National development" },
    ],
  },
  {
    id: "computing",
    label: "Computing",
    topics: [
      { id: "digital-safety", label: "Digital safety" },
      { id: "systems", label: "Computer systems" },
      { id: "internet", label: "Internet & networks" },
      { id: "coding", label: "Computational thinking" },
    ],
  },
];

const primaryLevels = ["KG 1", "KG 2", "Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5", "Basic 6"];
const secondaryLevels = ["JHS 1", "JHS 2", "JHS 3", "SHS 1", "SHS 2", "SHS 3"];

export const LEARNING_CATALOGS: LearningCatalog[] = [
  {
    id: "school",
    label: "School",
    programs: [
      {
        id: "ghana",
        label: "Ghana curriculum",
        description: "SukuuNova's first curriculum lane, structured from kindergarten through SHS.",
        levels: [...primaryLevels, ...secondaryLevels].map((label) => ({
          id: label.toLowerCase().replaceAll(" ", "-"),
          label,
          subjects: schoolSubjects,
        })),
      },
    ],
  },
  {
    id: "exam",
    label: "Exam Centre",
    programs: [
      {
        id: "bece",
        label: "BECE",
        description: "Subject practice, timed drills and full mock pathways for BECE preparation.",
        levels: [{ id: "practice", label: "BECE practice", subjects: schoolSubjects }],
      },
      {
        id: "wassce",
        label: "WASSCE",
        description: "A separate WASSCE lane so exam practice remains distinct from ordinary classwork.",
        levels: [{ id: "practice", label: "WASSCE practice", subjects: schoolSubjects }],
      },
      {
        id: "ielts",
        label: "IELTS",
        description: "Dedicated Academic and General Training pathways with section-specific practice.",
        levels: [
          {
            id: "academic",
            label: "Academic",
            subjects: [
              { id: "reading", label: "Reading", topics: [{ id: "reading-skills", label: "Reading skills" }, { id: "matching", label: "Matching" }, { id: "true-false", label: "True / False / Not Given" }] },
              { id: "listening", label: "Listening", topics: [{ id: "listening-detail", label: "Listening for detail" }, { id: "maps", label: "Maps & diagrams" }] },
              { id: "writing", label: "Writing", topics: [{ id: "task-1", label: "Task 1" }, { id: "task-2", label: "Task 2" }] },
              { id: "speaking", label: "Speaking", topics: [{ id: "part-1", label: "Part 1" }, { id: "part-2", label: "Part 2" }, { id: "part-3", label: "Part 3" }] },
            ],
          },
          {
            id: "general",
            label: "General Training",
            subjects: [
              { id: "reading", label: "Reading", topics: [{ id: "reading-skills", label: "Reading skills" }] },
              { id: "listening", label: "Listening", topics: [{ id: "listening-detail", label: "Listening for detail" }] },
              { id: "writing", label: "Writing", topics: [{ id: "task-1", label: "Task 1" }, { id: "task-2", label: "Task 2" }] },
              { id: "speaking", label: "Speaking", topics: [{ id: "part-1", label: "Part 1" }, { id: "part-2", label: "Part 2" }, { id: "part-3", label: "Part 3" }] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "university",
    label: "University",
    programs: [
      {
        id: "computer-science",
        label: "Computer Science",
        description: "Course and module practice for computing students.",
        levels: [{ id: "foundation", label: "Foundation", subjects: [{ id: "programming", label: "Programming", topics: [{ id: "variables", label: "Variables & data types" }, { id: "control-flow", label: "Control flow" }, { id: "data-structures", label: "Data structures" }] }, { id: "networks", label: "Computer Networks", topics: [{ id: "network-basics", label: "Network basics" }, { id: "protocols", label: "Protocols" }] }] }],
      },
      {
        id: "nursing",
        label: "Nursing",
        description: "Concept checks and case-oriented practice for nursing students.",
        levels: [{ id: "foundation", label: "Foundation", subjects: [{ id: "anatomy", label: "Anatomy & Physiology", topics: [{ id: "cardiovascular", label: "Cardiovascular system" }, { id: "respiratory", label: "Respiratory system" }] }, { id: "fundamentals", label: "Fundamentals of Nursing", topics: [{ id: "patient-care", label: "Patient care" }] }] }],
      },
      {
        id: "business",
        label: "Business",
        description: "Accounting, management and quantitative practice.",
        levels: [{ id: "foundation", label: "Foundation", subjects: [{ id: "accounting", label: "Financial Accounting", topics: [{ id: "double-entry", label: "Double entry" }, { id: "statements", label: "Financial statements" }] }, { id: "management", label: "Management", topics: [{ id: "functions", label: "Management functions" }] }] }],
      },
    ],
  },
  {
    id: "skills",
    label: "Professional & Skills",
    programs: [
      {
        id: "digital",
        label: "Digital Skills",
        description: "Everyday technology, productivity and online-safety skills.",
        levels: [{ id: "core", label: "Core skills", subjects: [{ id: "productivity", label: "Productivity", topics: [{ id: "documents", label: "Documents" }, { id: "spreadsheets", label: "Spreadsheets" }] }, { id: "safety", label: "Online Safety", topics: [{ id: "passwords", label: "Passwords & accounts" }, { id: "phishing", label: "Phishing awareness" }] }] }],
      },
      {
        id: "reasoning",
        label: "Aptitude & Reasoning",
        description: "Numerical, verbal and logical reasoning drills.",
        levels: [{ id: "core", label: "Core skills", subjects: [{ id: "numerical", label: "Numerical Reasoning", topics: [{ id: "ratios", label: "Ratios" }, { id: "patterns", label: "Number patterns" }] }, { id: "verbal", label: "Verbal Reasoning", topics: [{ id: "analogies", label: "Analogies" }] }] }],
      },
    ],
  },
];

function hashText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: T[], random: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function mathQuestion(index: number, random: () => number): LearnQuestion {
  const a = 2 + Math.floor(random() * 7);
  const x = 2 + Math.floor(random() * 12);
  const b = 1 + Math.floor(random() * 9);
  const c = a * x + b;
  const kind: QuestionKind = index % 3 === 0 ? "numeric" : index % 3 === 1 ? "single" : "fill";
  const common = {
    id: `math-${index}-${a}-${x}-${b}`,
    exposureKey: `math-linear-${a}-${x}-${b}`,
    subject: "Mathematics",
    topic: "Algebra",
    skill: "Solve one-variable linear equations",
    difficulty: (Math.min(5, 2 + Math.floor(index / 4)) as 1 | 2 | 3 | 4 | 5),
    prompt: `Solve for x: ${a}x + ${b} = ${c}`,
    answer: x,
    explanation: `Subtract ${b} from both sides to get ${a}x = ${a * x}. Then divide by ${a}, so x = ${x}.`,
    hint: `Undo the +${b} first, then divide by ${a}.`,
  };
  if (kind === "single") {
    const values = shuffle([x, x + 1, Math.max(1, x - 1), x + 2], random);
    return {
      ...common,
      kind,
      answer: String(values.indexOf(x)),
      options: values.map((value, optionIndex) => ({ id: String(optionIndex), label: `x = ${value}` })),
    };
  }
  return { ...common, kind, answer: x, acceptedAnswers: [String(x)] };
}

const fixedQuestionFactories: Array<(index: number) => LearnQuestion> = [
  (index) => ({
    id: `science-${index}`,
    exposureKey: "science-transpiration",
    kind: "single",
    subject: "Science",
    topic: "Living things",
    skill: "Identify plant life processes",
    difficulty: 2,
    prompt: "Which process describes the loss of water vapour from the aerial parts of a plant, mainly through stomata?",
    options: [{ id: "respiration", label: "Respiration" }, { id: "transpiration", label: "Transpiration" }, { id: "germination", label: "Germination" }, { id: "pollination", label: "Pollination" }],
    answer: "transpiration",
    explanation: "Transpiration is the loss of water vapour from a plant, especially through stomata in its leaves.",
  }),
  (index) => ({
    id: `english-${index}`,
    exposureKey: "english-concord-neither-nor",
    kind: "fill",
    subject: "English Language",
    topic: "Grammar & concord",
    skill: "Subject–verb agreement",
    difficulty: 3,
    prompt: "Complete the sentence with the best verb: Neither Ama nor her friends ___ late for the lesson.",
    answer: "are",
    acceptedAnswers: ["are"],
    explanation: "With ‘neither … nor’, the verb normally agrees with the nearer subject. ‘Friends’ is plural, so ‘are’ fits.",
  }),
  (index) => ({
    id: `computing-${index}`,
    exposureKey: "computing-passwords",
    kind: "multi",
    subject: "Computing",
    topic: "Digital safety",
    skill: "Apply safe account practices",
    difficulty: 2,
    prompt: "Select every practice that improves account security.",
    options: [{ id: "unique", label: "Use a unique password for each important account" }, { id: "mfa", label: "Enable multi-factor authentication when available" }, { id: "share", label: "Share passwords with classmates" }, { id: "birthyear", label: "Use your birth year as your password" }],
    answer: ["unique", "mfa"],
    explanation: "Unique passwords limit reuse risk, and multi-factor authentication adds an additional verification step.",
  }),
  (index) => ({
    id: `social-${index}`,
    exposureKey: "social-constitution-purpose",
    kind: "boolean",
    subject: "Social Studies",
    topic: "Governance",
    skill: "Understand constitutional government",
    difficulty: 2,
    prompt: "True or false: A national constitution can define the powers of state institutions and protect fundamental rights.",
    answer: true,
    explanation: "A constitution commonly establishes institutions and powers and provides fundamental legal protections and rules of governance.",
  }),
  (index) => ({
    id: `english-short-${index}`,
    exposureKey: "english-vocab-concise",
    kind: "short",
    subject: "English Language",
    topic: "Vocabulary",
    skill: "Use vocabulary precisely",
    difficulty: 2,
    prompt: "Give one word meaning ‘expressing much in few words’.",
    answer: "concise",
    acceptedAnswers: ["concise", "brief", "succinct"],
    explanation: "‘Concise’, ‘brief’ and ‘succinct’ can all describe language that expresses much in relatively few words.",
  }),
];

function matchesSelection(question: LearnQuestion, subjectId: string, topicId: string) {
  const subject = subjectId.toLowerCase();
  const topic = topicId.toLowerCase();
  const questionSubject = question.subject.toLowerCase();
  const questionTopic = question.topic.toLowerCase();
  const subjectMatches = subject === "all" || questionSubject.includes(subject.replaceAll("-", " ")) || subject.includes(questionSubject.split(" ")[0]);
  const topicMatches = topic === "all" || questionTopic.includes(topic.replaceAll("-", " ")) || topic.includes(questionTopic.split(" ")[0]);
  return subjectMatches && topicMatches;
}

export function buildSession(config: SessionConfig): LearnQuestion[] {
  const requested = Math.max(1, Math.min(100, config.count));
  const seed = config.seed ?? hashText(`${config.lane}:${config.programId}:${config.levelId}:${config.subjectId}:${config.topicId}:${Date.now()}`);
  const random = mulberry32(seed);
  const seen = new Set(config.seen ?? []);
  const candidates: LearnQuestion[] = [];

  for (let index = 0; index < Math.max(24, requested * 2); index += 1) {
    candidates.push(mathQuestion(index, random));
    const factory = fixedQuestionFactories[index % fixedQuestionFactories.length];
    candidates.push(factory(index));
  }

  let filtered = candidates.filter((question) => matchesSelection(question, config.subjectId, config.topicId));
  if (filtered.length < requested) filtered = candidates;

  const unseen = filtered.filter((question) => !seen.has(question.exposureKey));
  const recycled = filtered.filter((question) => seen.has(question.exposureKey));
  const ordered = [...shuffle(unseen, random), ...shuffle(recycled, random)];

  if (config.mode === "adaptive") {
    ordered.sort((left, right) => left.difficulty - right.difficulty || random() - 0.5);
  } else if (config.mode === "random") {
    return shuffle(ordered, random).slice(0, requested);
  }

  return ordered.slice(0, requested);
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isCorrectAnswer(question: LearnQuestion, response: string | string[] | number | boolean) {
  if (question.kind === "multi") {
    if (!Array.isArray(response) || !Array.isArray(question.answer)) return false;
    const expected = [...question.answer].sort();
    const actual = [...response].sort();
    return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
  }

  if (question.kind === "boolean") return response === question.answer;

  if (question.kind === "numeric") {
    const actual = typeof response === "number" ? response : Number(response);
    const expected = typeof question.answer === "number" ? question.answer : Number(question.answer);
    return Number.isFinite(actual) && Math.abs(actual - expected) < 0.000001;
  }

  const actual = normalizeText(String(response));
  const accepted = question.acceptedAnswers?.map(normalizeText) ?? [normalizeText(String(question.answer))];
  return accepted.includes(actual);
}

export function catalogFor(lane: LearnLane) {
  return LEARNING_CATALOGS.find((catalog) => catalog.id === lane) ?? LEARNING_CATALOGS[0];
}
