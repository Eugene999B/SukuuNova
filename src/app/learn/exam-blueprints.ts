export type ExamPaper = {
  id: string;
  label: string;
  responseMode: "objective" | "written" | "practical" | "mixed";
  durationMinutes?: number;
};

export type ExamSubjectBlueprint = {
  id: string;
  label: string;
  practiceReady: boolean;
  practiceScope?: "topic";
  fullMockReady?: boolean;
  papers?: ExamPaper[];
};

export type ExamBlueprint = {
  id: "bece-2026" | "wassce-2026";
  label: string;
  authority: string;
  country: "Ghana";
  referenceYear: 2026;
  lastVerified: "2026-09-19";
  sourceLabel: string;
  sourceUrl: string;
  note: string;
  subjects: ExamSubjectBlueprint[];
};

export const EXAM_BLUEPRINTS: ExamBlueprint[] = [
  {
    id: "bece-2026",
    label: "BECE 2026",
    authority: "West African Examinations Council, Ghana",
    country: "Ghana",
    referenceYear: 2026,
    lastVerified: "2026-09-19",
    sourceLabel: "WAEC Ghana 2026 BECE final timetable",
    sourceUrl: "https://waecgh.org/wp-content/uploads/2026/03/BECESCPC_TIMETABLE.pdf",
    note: "Paper durations below are a 2026 timetable snapshot. SukuuNova keeps the year attached so future exam changes do not silently rewrite older practice blueprints.",
    subjects: [
      {
        id: "english",
        label: "English Language",
        practiceReady: false,
        fullMockReady: false,
        papers: [
          { id: "english-2", label: "Paper 2 · Essay", responseMode: "written", durationMinutes: 70 },
          { id: "english-1", label: "Paper 1 · Objective", responseMode: "objective", durationMinutes: 50 },
        ],
      },
      {
        id: "social-studies",
        label: "Social Studies",
        practiceReady: false,
        fullMockReady: false,
        papers: [
          { id: "social-2", label: "Paper 2 · Essay", responseMode: "written", durationMinutes: 60 },
          { id: "social-1", label: "Paper 1 · Objective", responseMode: "objective", durationMinutes: 45 },
        ],
      },
      {
        id: "science",
        label: "Science",
        practiceReady: false,
        fullMockReady: false,
        papers: [
          { id: "science-2", label: "Paper 2 · Essay", responseMode: "written", durationMinutes: 85 },
          { id: "science-1", label: "Paper 1 · Objective", responseMode: "objective", durationMinutes: 45 },
        ],
      },
      {
        id: "mathematics",
        label: "Mathematics",
        practiceReady: false,
        fullMockReady: false,
        papers: [
          { id: "math-2", label: "Paper 2 · Essay", responseMode: "written", durationMinutes: 60 },
          { id: "math-1", label: "Paper 1 · Objective", responseMode: "objective", durationMinutes: 60 },
        ],
      },
      {
        id: "computing",
        label: "Computing",
        practiceReady: false,
        fullMockReady: false,
        papers: [
          { id: "computing-2", label: "Paper 2 · Essay", responseMode: "written", durationMinutes: 75 },
          { id: "computing-1", label: "Paper 1 · Objective", responseMode: "objective", durationMinutes: 45 },
        ],
      },
      { id: "rme", label: "Religious and Moral Education", practiceReady: false },
      { id: "career-technology", label: "Career Technology", practiceReady: false },
      { id: "creative-arts", label: "Creative Arts & Design", practiceReady: false },
      { id: "ghanaian-language", label: "Ghanaian Language", practiceReady: false },
      { id: "french", label: "French", practiceReady: false },
      { id: "arabic", label: "Arabic", practiceReady: false },
    ],
  },
  {
    id: "wassce-2026",
    label: "WASSCE 2026",
    authority: "West African Examinations Council, Ghana",
    country: "Ghana",
    referenceYear: 2026,
    lastVerified: "2026-09-19",
    sourceLabel: "WAEC Ghana WASSCE School subject information",
    sourceUrl: "https://waecgh.org/home/wassce-school/",
    note: "WAEC lists four core subjects for school candidates. Elective combinations depend on the candidate's programme, so SukuuNova models them separately instead of pretending one universal elective blueprint exists.",
    subjects: [
      { id: "english", label: "English Language", practiceReady: false, fullMockReady: false },
      { id: "integrated-science", label: "Integrated Science", practiceReady: false, fullMockReady: false },
      { id: "core-mathematics", label: "Mathematics (Core)", practiceReady: false, fullMockReady: false },
      { id: "social-studies", label: "Social Studies", practiceReady: false, fullMockReady: false },
    ],
  },
];

export const GHANA_CCP_REFERENCE = {
  label: "NaCCA Common Core Programme",
  scope: "JHS 1 – JHS 3",
  lastVerified: "2026-09-17" as const,
  sourceUrl: "https://nacca.gov.gh/common-core-programme-ccp/",
};

export function examBlueprint(id: ExamBlueprint["id"]) {
  const blueprint = EXAM_BLUEPRINTS.find((item) => item.id === id);
  if (!blueprint) throw new Error(`Unknown exam blueprint: ${id}`);
  return blueprint;
}

export function practiceReadySubjects(blueprint: ExamBlueprint) {
  return blueprint.subjects.filter((subject) => subject.practiceReady);
}
