import { SHS_PROGRAMS, UNIVERSITY_PROGRAMS } from "./broad-catalog";

export type LearnLane = "school" | "exam" | "university" | "skills";
export type PracticeMode = "topic" | "adaptive" | "random" | "timed" | "weakness";
export type QuestionKind = "single" | "multi" | "fill" | "numeric" | "boolean" | "short";
export type CognitiveChallenge = "Recall" | "Apply" | "Analyse" | "Evaluate" | "Transfer";

export type CatalogAvailability = "ready" | "expanding";

export type CatalogTopic = {
  id: string;
  label: string;
  availability?: CatalogAvailability;
};

export type CatalogSubject = {
  id: string;
  label: string;
  topics: CatalogTopic[];
  availability?: CatalogAvailability;
  contentLabel?: string;
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
  challenge?: CognitiveChallenge;
  mission?: string;
  generationFamily?: string;
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
  mastery?: Record<string, { answered: number; correct: number }>;
  streak?: number;
};

function slugTopic(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function subjectTopicLabels(id: string, label: string) {
  const value = `${id} ${label}`.toLowerCase();

  if (/math|numeracy/.test(value)) {
    return ["Number & operations", "Algebra & relationships", "Geometry & measurement", "Statistics & probability", "Financial mathematics"];
  }
  if (/english|language|french|arabic|literature|communication/.test(value)) {
    return ["Listening & speaking", "Vocabulary & grammar", "Reading & interpretation", "Writing & composition", "Culture & literature"];
  }
  if (/comput|ict|digital|robotic/.test(value)) {
    return ["Computer systems", "Programming & algorithms", "Data & information", "Networks & internet", "Digital safety & ethics"];
  }
  if (/biology|biomedical|human biology/.test(value)) {
    return ["Cells & organisation", "Body systems & physiology", "Genetics & inheritance", "Ecology & environment", "Scientific investigation"];
  }
  if (/chemistry/.test(value)) {
    return ["Quantitative chemistry & reactions", "Atomic structure & bonding", "Acids, bases & solutions", "Organic chemistry", "Laboratory analysis"];
  }
  if (/physics/.test(value)) {
    return ["Mechanics & motion", "Electricity & circuits", "Waves & optics", "Energy & thermal physics", "Practical measurement"];
  }
  if (/science/.test(value)) {
    return ["Living things", "Matter & materials", "Force, energy & motion", "Earth & environment", "Scientific investigation"];
  }
  if (/account|business|economics|management|finance|cost/.test(value)) {
    return ["Accounting & financial analysis", "Costs, pricing & break-even", "Markets & economic decisions", "Management & enterprise", "Business mathematics & data"];
  }
  if (/agricultur|crop|animal|fisher|forestry|soil|agribusiness/.test(value)) {
    return ["Soil & plant production", "Animal production & health", "Farm tools & technology", "Natural resources & sustainability", "Agribusiness & farm management"];
  }
  if (/technical|engineering|electric|electronic|mechanic|construction|woodwork|metalwork|drawing|aviation|manufactur/.test(value)) {
    return ["Tools, safety & workshop practice", "Materials & structures", "Technical drawing & measurement", "Systems, machines & processes", "Design, maintenance & evaluation"];
  }
  if (/food|nutrition|clothing|textile|home economics|management in living/.test(value)) {
    return ["Food, nutrition & health", "Textiles & clothing", "Family & resource management", "Practical production & safety", "Enterprise & consumer decisions"];
  }
  if (/art|design|music|drama|dance|performing|sculpt|ceramic|leather|basketry|picture/.test(value)) {
    return ["Elements & principles", "Materials & techniques", "Creating & performing", "Interpretation & criticism", "Presentation & production"];
  }
  if (/government|social|history|geograph|citizen|rme|religious|moral/.test(value)) {
    return ["Identity, culture & society", "Governance & citizenship", "People, place & environment", "History, change & development", "Values, evidence & participation"];
  }
  if (/career/.test(value)) {
    return ["Design & problem solving", "Materials & tools", "Food & home technology", "Enterprise & careers", "Safety & sustainable practice"];
  }
  if (/pe|physical education|health/.test(value)) {
    return ["Movement skills", "Fitness & conditioning", "Games & sport", "Health & safety", "Teamwork & wellbeing"];
  }

  return [
    `${label} essentials`,
    `${label} methods & processes`,
    `${label} application & problem solving`,
    `${label} evidence & interpretation`,
    `${label} review & practice`,
  ];
}

function expandingSubject(id: string, label: string): CatalogSubject {
  return {
    id,
    label,
    topics: subjectTopicLabels(id, label).map((topic) => ({ id: slugTopic(topic), label: topic })),
  };
}

function expandingDetailedSubject(id: string, label: string, topics: CatalogTopic[]): CatalogSubject {
  return {
    id,
    label,
    topics: topics.map((topic) => ({ id: topic.id, label: topic.label })),
  };
}

function readyDetailedSubject(id: string, label: string, topics: CatalogTopic[]): CatalogSubject {
  return { id, label, topics };
}

function markSubjectExpanding(subject: CatalogSubject): CatalogSubject {
  return {
    id: subject.id,
    label: subject.label,
    ...(subject.contentLabel ? { contentLabel: subject.contentLabel } : {}),
    topics: subject.topics.map((topic) => ({ id: topic.id, label: topic.label })),
  };
}

const mathematicsSubject: CatalogSubject = {
  id: "mathematics",
  label: "Mathematics",
  topics: [
    { id: "number", label: "Number & operations" },
    { id: "algebra", label: "Algebra" },
    { id: "geometry", label: "Geometry" },
    { id: "statistics", label: "Statistics & probability" },
  ],
};

const englishSubject: CatalogSubject = {
  id: "english",
  label: "English Language",
  topics: [
    { id: "grammar", label: "Grammar & concord" },
    { id: "vocabulary", label: "Vocabulary" },
    { id: "reading", label: "Reading comprehension" },
    { id: "writing", label: "Writing" },
  ],
};

const scienceSubject: CatalogSubject = {
  id: "science",
  label: "Science",
  topics: [
    { id: "living", label: "Living things" },
    { id: "matter", label: "Matter & materials" },
    { id: "energy", label: "Force & energy" },
    { id: "environment", label: "Environment" },
  ],
};

const socialSubject: CatalogSubject = {
  id: "social",
  label: "Social Studies",
  topics: [
    { id: "governance", label: "Governance" },
    { id: "citizenship", label: "Citizenship" },
    { id: "environment", label: "People & environment" },
    { id: "development", label: "National development" },
  ],
};

const computingSubject: CatalogSubject = {
  id: "computing",
  label: "Computing",
  topics: [
    { id: "digital-safety", label: "Digital safety" },
    { id: "systems", label: "Computer systems" },
    { id: "internet", label: "Internet & networks" },
    { id: "coding", label: "Computational thinking" },
  ],
};

const kgNumeracySubject: CatalogSubject = {
  id: "numeracy",
  label: "Numeracy",
  topics: [
    { id: "number-stories", label: "Counting & simple number stories" },
    { id: "patterns", label: "Patterns", availability: "expanding" },
    { id: "measurement", label: "Early measurement", availability: "expanding" },
  ],
};

const kgSubjects: CatalogSubject[] = [
  kgNumeracySubject,
  expandingSubject("language-literacy", "Language & Literacy"),
  expandingSubject("creative-arts", "Creative Arts"),
  expandingSubject("owop", "Our World & Our People"),
];

const lowerPrimaryMathematics: CatalogSubject = {
  id: "mathematics",
  label: "Mathematics",
  topics: [
    { id: "number", label: "Number & operations" },
    { id: "geometry", label: "Geometry", availability: "expanding" },
    { id: "measurement", label: "Measurement", availability: "expanding" },
    { id: "data", label: "Data", availability: "expanding" },
  ],
};

const lowerPrimarySubjects: CatalogSubject[] = [
  lowerPrimaryMathematics,
  expandingSubject("english", "English Language"),
  expandingSubject("science", "Science"),
  expandingSubject("ghanaian-language", "Ghanaian Language"),
  expandingSubject("history", "History"),
  expandingSubject("creative-arts", "Creative Arts"),
  expandingSubject("rme", "Religious and Moral Education"),
  expandingSubject("pe", "Physical Education"),
];

const upperPrimaryMathematics: CatalogSubject = {
  id: "mathematics",
  label: "Mathematics",
  topics: [
    { id: "number", label: "Number & operations" },
    { id: "geometry", label: "Geometry" },
    { id: "measurement", label: "Measurement", availability: "expanding" },
    { id: "data", label: "Data handling", availability: "expanding" },
  ],
};

const upperPrimaryEnglish: CatalogSubject = {
  id: "english",
  label: "English Language",
  topics: [
    { id: "grammar", label: "Grammar & concord" },
    { id: "vocabulary", label: "Vocabulary", availability: "expanding" },
    { id: "reading", label: "Reading comprehension", availability: "expanding" },
    { id: "writing", label: "Writing", availability: "expanding" },
  ],
};

const upperPrimarySubjects: CatalogSubject[] = [
  upperPrimaryMathematics,
  upperPrimaryEnglish,
  expandingSubject("science", "Science"),
  expandingSubject("ghanaian-language", "Ghanaian Language"),
  expandingSubject("history", "History"),
  expandingSubject("creative-arts", "Creative Arts"),
  expandingSubject("rme", "Religious and Moral Education"),
  expandingSubject("pe", "Physical Education"),
  expandingSubject("french", "French"),
  expandingSubject("computing", "Computing"),
];

const upperPrimaryExpandingSubjects = upperPrimarySubjects.map(markSubjectExpanding);

const jhsSubjects: CatalogSubject[] = [
  mathematicsSubject,
  englishSubject,
  scienceSubject,
  socialSubject,
  computingSubject,
  expandingSubject("french", "French Language"),
  expandingSubject("arabic", "Arabic"),
  expandingSubject("ghanaian-language", "Ghanaian Language"),
  expandingSubject("pe-health", "Physical Education & Health"),
  expandingSubject("rme", "Religious and Moral Education"),
  expandingSubject("creative-arts-design", "Creative Arts & Design"),
  expandingSubject("career-technology", "Career Technology"),
];

const jhsExpandingSubjects = jhsSubjects.map(markSubjectExpanding);

const generalScienceSubject: CatalogSubject = {
  ...scienceSubject,
  label: "General Science",
  contentLabel: "Science",
};

const shsSubjects: CatalogSubject[] = [
  markSubjectExpanding(mathematicsSubject),
  markSubjectExpanding(englishSubject),
  markSubjectExpanding(generalScienceSubject),
  markSubjectExpanding(socialSubject),
  markSubjectExpanding(computingSubject),
  expandingSubject("additional-mathematics", "Additional Mathematics"),
  expandingSubject("agricultural-science", "Agricultural Science"),
  expandingSubject("agriculture", "Agriculture"),
  expandingSubject("applied-technology", "Applied Technology"),
  expandingSubject("arabic", "Arabic"),
  expandingSubject("art-design-foundation", "Art & Design Foundation"),
  expandingSubject("art-design-studio", "Art & Design Studio"),
  expandingSubject("aviation-aerospace-engineering", "Aviation & Aerospace Engineering"),
  expandingSubject("biology", "Biology"),
  expandingSubject("biomedical-science", "Biomedical Science"),
  expandingSubject("chemistry", "Chemistry"),
  expandingSubject("design-communication-technology", "Design Communication Technology"),
  expandingSubject("economics", "Economics"),
  expandingSubject("engineering", "Engineering"),
  expandingSubject("french", "French"),
  expandingSubject("government", "Government"),
  expandingSubject("history", "History"),
  expandingSubject("ict", "Information & Communication Technology"),
  expandingSubject("literature-english", "Literature in English"),
  expandingSubject("manufacturing-engineering", "Manufacturing Engineering"),
  expandingSubject("performing-arts", "Performing Arts"),
  expandingSubject("pe-health-core", "Physical Education & Health (Core)"),
  expandingSubject("pe-health-elective", "Physical Education & Health (Elective)"),
  expandingSubject("physics", "Physics"),
  expandingSubject("rme", "Religious and Moral Education"),
  expandingSubject("robotics", "Robotics"),
  expandingSubject("spanish", "Spanish"),
  expandingSubject("geography", "Geography"),
];

const beceSubjects: CatalogSubject[] = [
  markSubjectExpanding(mathematicsSubject),
  markSubjectExpanding(englishSubject),
  markSubjectExpanding(scienceSubject),
  markSubjectExpanding(socialSubject),
  markSubjectExpanding(computingSubject),
  expandingSubject("arabic", "Arabic"),
  expandingSubject("career-technology", "Career Technology"),
  expandingSubject("creative-arts-design", "Creative Art & Design"),
  expandingSubject("french", "French"),
  expandingSubject("ghanaian-language", "Ghanaian Language"),
  expandingSubject("rme", "Religious and Moral Education"),
];

const wassceCoreSubjects: CatalogSubject[] = [
  { ...markSubjectExpanding(mathematicsSubject), label: "Mathematics (Core)", contentLabel: "Mathematics" },
  markSubjectExpanding(englishSubject),
  { ...markSubjectExpanding(scienceSubject), label: "Integrated Science", contentLabel: "Science" },
  markSubjectExpanding(socialSubject),
];

const wassceElectives: CatalogSubject[] = [
  expandingSubject("elective-mathematics", "Mathematics (Elective)"),
  expandingSubject("biology", "Biology"),
  expandingSubject("chemistry", "Chemistry"),
  expandingSubject("physics", "Physics"),
  expandingSubject("geography", "Geography"),
  expandingSubject("government", "Government"),
  expandingSubject("economics", "Economics"),
  expandingSubject("history", "History"),
  expandingSubject("literature-english", "Literature in English"),
  expandingSubject("french", "French"),
  expandingSubject("arabic", "Arabic"),
  expandingSubject("general-agriculture", "General Agriculture"),
  expandingSubject("animal-husbandry", "Animal Husbandry"),
  expandingSubject("crop-husbandry", "Crop Husbandry & Horticulture"),
  expandingSubject("fisheries", "Fisheries"),
  expandingSubject("forestry", "Forestry"),
  expandingSubject("business-management", "Business Management"),
  expandingSubject("financial-accounting", "Financial Accounting"),
  expandingSubject("cost-accounting", "Principles of Cost Accounting"),
  expandingSubject("ict-elective", "ICT (Elective)"),
  expandingSubject("technical-drawing", "Technical Drawing"),
  expandingSubject("applied-electricity", "Applied Electricity"),
  expandingSubject("auto-mechanics", "Auto Mechanics"),
  expandingSubject("building-construction", "Building Construction"),
  expandingSubject("electronics", "Electronics"),
  expandingSubject("metalwork", "Metalwork"),
  expandingSubject("woodwork", "Woodwork"),
  expandingSubject("foods-nutrition", "Foods & Nutrition"),
  expandingSubject("clothing-textiles", "Clothing & Textiles"),
  expandingSubject("graphic-design", "Graphic Design"),
  expandingSubject("music", "Music"),
  expandingSubject("engineering", "Engineering"),
  expandingSubject("biomedical-science", "Biomedical Science"),
  expandingSubject("manufacturing-engineering", "Manufacturing Engineering"),
  expandingSubject("aviation-aerospace-engineering", "Aviation & Aerospace Engineering"),
];

const ieltsAcademicSubjects: CatalogSubject[] = [
  expandingDetailedSubject("reading", "Reading", [
    { id: "reading-skills", label: "Reading skills" },
    { id: "matching", label: "Matching" },
    { id: "true-false", label: "True / False / Not Given" },
  ]),
  expandingDetailedSubject("listening", "Listening", [
    { id: "listening-detail", label: "Listening for detail" },
    { id: "maps", label: "Maps & diagrams" },
  ]),
  expandingDetailedSubject("writing", "Writing", [
    { id: "task-1", label: "Task 1" },
    { id: "task-2", label: "Task 2" },
  ]),
  expandingDetailedSubject("speaking", "Speaking", [
    { id: "part-1", label: "Part 1" },
    { id: "part-2", label: "Part 2" },
    { id: "part-3", label: "Part 3" },
  ]),
];

const ieltsGeneralSubjects: CatalogSubject[] = [
  expandingDetailedSubject("reading", "Reading", [{ id: "reading-skills", label: "Reading skills" }]),
  expandingDetailedSubject("listening", "Listening", [{ id: "listening-detail", label: "Listening for detail" }]),
  expandingDetailedSubject("writing", "Writing", [
    { id: "task-1", label: "Task 1" },
    { id: "task-2", label: "Task 2" },
  ]),
  expandingDetailedSubject("speaking", "Speaking", [
    { id: "part-1", label: "Part 1" },
    { id: "part-2", label: "Part 2" },
    { id: "part-3", label: "Part 3" },
  ]),
];

function schoolLevel(id: string, label: string, subjects: CatalogSubject[]): CatalogLevel {
  return { id, label, subjects };
}

export const LEARNING_CATALOGS: LearningCatalog[] = [
  {
    id: "school",
    label: "School",
    programs: [
      {
        id: "ghana",
        label: "KG · Primary · JHS",
        description: "Ghana's basic-school pathway from KG through JHS. Senior High is separated into its own study pathways so learners can choose the programme that matches their subjects.",
        levels: [
          schoolLevel("kg-1", "KG 1", kgSubjects),
          schoolLevel("kg-2", "KG 2", kgSubjects),
          schoolLevel("basic-1", "Basic 1", lowerPrimarySubjects),
          schoolLevel("basic-2", "Basic 2", lowerPrimarySubjects),
          schoolLevel("basic-3", "Basic 3", lowerPrimarySubjects),
          schoolLevel("basic-4", "Basic 4", upperPrimarySubjects),
          schoolLevel("basic-5", "Basic 5", upperPrimaryExpandingSubjects),
          schoolLevel("basic-6", "Basic 6", upperPrimaryExpandingSubjects),
          schoolLevel("jhs-1", "JHS 1", jhsSubjects),
          schoolLevel("jhs-2", "JHS 2", jhsExpandingSubjects),
          schoolLevel("jhs-3", "JHS 3", jhsExpandingSubjects),
        ],
      },
      ...SHS_PROGRAMS,
    ],
  },
  {
    id: "exam",
    label: "Exam Centre",
    programs: [
      {
        id: "bece",
        label: "BECE",
        description: "The current Ghana BECE subject map is visible, but exam-specific practice is held back until paper-aligned question packs are validated.",
        levels: [{ id: "practice", label: "BECE practice", subjects: beceSubjects }],
      },
      {
        id: "wassce",
        label: "WASSCE",
        description: "The current WASSCE structure is mapped, but trusted paper-specific practice is still expanding and is not exposed as ready.",
        levels: [{ id: "practice", label: "WASSCE practice", subjects: [...wassceCoreSubjects, ...wassceElectives] }],
      },
      {
        id: "ielts",
        label: "IELTS",
        description: "Academic and General Training structures are mapped separately; reviewed interactive task coverage is expanding.",
        levels: [
          { id: "academic", label: "Academic", subjects: ieltsAcademicSubjects },
          { id: "general", label: "General Training", subjects: ieltsGeneralSubjects },
        ],
      },
    ],
  },
  {
    id: "university",
    label: "University",
    programs: UNIVERSITY_PROGRAMS,
  },
  {
    id: "skills",
    label: "Professional & Skills",
    programs: [
      {
        id: "digital",
        label: "Digital Skills",
        description: "Everyday technology, productivity and online-safety skills.",
        levels: [{ id: "core", label: "Core skills", subjects: [
          readyDetailedSubject("productivity", "Productivity", [
            { id: "documents", label: "Documents" },
            { id: "spreadsheets", label: "Spreadsheets" },
          ]),
          readyDetailedSubject("safety", "Online Safety", [
            { id: "passwords", label: "Passwords & accounts" },
            { id: "phishing", label: "Phishing awareness" },
          ]),
        ] }],
      },
      {
        id: "reasoning",
        label: "Aptitude & Reasoning",
        description: "Numerical, verbal and logical reasoning drills.",
        levels: [{ id: "core", label: "Core skills", subjects: [
          readyDetailedSubject("numerical", "Numerical Reasoning", [
            { id: "ratios", label: "Ratios" },
            { id: "patterns", label: "Number patterns" },
          ]),
          readyDetailedSubject("verbal", "Verbal Reasoning", [{ id: "analogies", label: "Analogies" }]),
        ] }],
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
