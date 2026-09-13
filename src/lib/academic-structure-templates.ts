export type AcademicStructureTemplateKey =
  | "ghana_standard"
  | "british"
  | "american"
  | "cambridge"
  | "montessori"
  | "tvet"
  | "ib";

export type AcademicLevelKind = "early_years" | "grade" | "year" | "stage" | "level";

export type AcademicStructureLevelTemplate = {
  key: string;
  name: string;
  shortName?: string;
  phase: string;
  sequence: number;
  kind: AcademicLevelKind;
  isTerminal?: boolean;
  pathwayRequired?: boolean;
};

export type AcademicStructurePathwayTemplate = {
  code: string;
  name: string;
  category?: string;
};

export type AcademicStructureProgressionTemplate = {
  from: string;
  to?: string;
  outcome: "advance" | "complete" | "exit";
  isDefault?: boolean;
  priority?: number;
  targetPathwayCode?: string;
};

export type AcademicStructureTemplate = {
  key: AcademicStructureTemplateKey;
  name: string;
  description: string;
  levels: AcademicStructureLevelTemplate[];
  pathways: AcademicStructurePathwayTemplate[];
  progression: AcademicStructureProgressionTemplate[];
};

function level(
  key: string,
  name: string,
  phase: string,
  sequence: number,
  kind: AcademicLevelKind = "grade",
  options: Pick<AcademicStructureLevelTemplate, "shortName" | "isTerminal" | "pathwayRequired"> = {},
): AcademicStructureLevelTemplate {
  return { key, name, phase, sequence, kind, ...options };
}

function linearProgression(levels: AcademicStructureLevelTemplate[]): AcademicStructureProgressionTemplate[] {
  return levels.map((current, index) => {
    const next = levels[index + 1];
    if (!next) return { from: current.key, outcome: "complete", isDefault: true, priority: 100 };
    return { from: current.key, to: next.key, outcome: "advance", isDefault: true, priority: 100 };
  });
}

const ghanaLevels: AcademicStructureLevelTemplate[] = [
  level("creche", "Creche", "Early Childhood", 10, "early_years", { shortName: "Creche" }),
  level("nursery_1", "Nursery 1", "Early Childhood", 20, "early_years", { shortName: "N1" }),
  level("nursery_2", "Nursery 2", "Early Childhood", 30, "early_years", { shortName: "N2" }),
  level("kg_1", "KG 1", "Kindergarten", 40, "early_years", { shortName: "KG1" }),
  level("kg_2", "KG 2", "Kindergarten", 50, "early_years", { shortName: "KG2" }),
  ...Array.from({ length: 6 }, (_, index) => level(`basic_${index + 1}`, `Basic ${index + 1}`, "Primary", 60 + index * 10, "grade", { shortName: `B${index + 1}` })),
  ...Array.from({ length: 3 }, (_, index) => level(`jhs_${index + 1}`, `JHS ${index + 1}`, "Junior High School", 120 + index * 10, "grade", { shortName: `JHS${index + 1}` })),
  ...Array.from({ length: 3 }, (_, index) => level(`shs_${index + 1}`, `SHS ${index + 1}`, "Senior High School", 150 + index * 10, "grade", {
    shortName: `SHS${index + 1}`,
    pathwayRequired: true,
    isTerminal: index === 2,
  })),
];

const britishLevels: AcademicStructureLevelTemplate[] = [
  level("nursery", "Nursery", "Early Years", 10, "early_years"),
  level("reception", "Reception", "Early Years", 20, "early_years"),
  ...Array.from({ length: 13 }, (_, index) => level(`year_${index + 1}`, `Year ${index + 1}`, index < 6 ? "Primary" : index < 11 ? "Secondary" : "Sixth Form", 30 + index * 10, "year", { isTerminal: index === 12 })),
];

const americanLevels: AcademicStructureLevelTemplate[] = [
  level("pre_k", "Pre-K", "Early Childhood", 10, "early_years"),
  level("kindergarten", "Kindergarten", "Elementary", 20, "grade", { shortName: "K" }),
  ...Array.from({ length: 12 }, (_, index) => level(`grade_${index + 1}`, `Grade ${index + 1}`, index < 5 ? "Elementary" : index < 8 ? "Middle School" : "High School", 30 + index * 10, "grade", { isTerminal: index === 11 })),
];

const cambridgeLevels: AcademicStructureLevelTemplate[] = [
  level("early_years_1", "Early Years 1", "Cambridge Early Years", 10, "stage"),
  level("early_years_2", "Early Years 2", "Cambridge Early Years", 20, "stage"),
  level("early_years_3", "Early Years 3", "Cambridge Early Years", 30, "stage"),
  ...Array.from({ length: 6 }, (_, index) => level(`primary_stage_${index + 1}`, `Primary Stage ${index + 1}`, "Cambridge Primary", 40 + index * 10, "stage")),
  ...Array.from({ length: 3 }, (_, index) => level(`lower_secondary_${index + 7}`, `Lower Secondary Stage ${index + 7}`, "Cambridge Lower Secondary", 100 + index * 10, "stage")),
  level("upper_secondary_1", "Upper Secondary 1", "Cambridge Upper Secondary", 130, "stage"),
  level("upper_secondary_2", "Upper Secondary 2", "Cambridge Upper Secondary", 140, "stage"),
  level("advanced_1", "Advanced 1", "Cambridge Advanced", 150, "stage"),
  level("advanced_2", "Advanced 2", "Cambridge Advanced", 160, "stage", { isTerminal: true }),
];

const montessoriLevels: AcademicStructureLevelTemplate[] = [
  level("nido", "Nido / Infant Community", "Montessori Early Childhood", 10, "stage"),
  level("toddler", "Toddler Community", "Montessori Early Childhood", 20, "stage"),
  level("childrens_house", "Children's House", "Montessori Primary", 30, "stage"),
  level("lower_elementary", "Lower Elementary", "Montessori Elementary", 40, "stage"),
  level("upper_elementary", "Upper Elementary", "Montessori Elementary", 50, "stage"),
  level("adolescent", "Adolescent Community", "Montessori Secondary", 60, "stage"),
  level("senior_secondary", "Senior Secondary", "Montessori Secondary", 70, "stage", { isTerminal: true }),
];

const tvetLevels: AcademicStructureLevelTemplate[] = [
  level("foundation", "Foundation", "TVET Foundation", 10, "level"),
  level("level_1", "Level 1", "TVET Programme", 20, "level", { pathwayRequired: true }),
  level("level_2", "Level 2", "TVET Programme", 30, "level", { pathwayRequired: true }),
  level("level_3", "Level 3", "TVET Programme", 40, "level", { pathwayRequired: true, isTerminal: true }),
];

const ibLevels: AcademicStructureLevelTemplate[] = [
  level("pyp_early_years", "PYP Early Years", "IB Primary Years Programme", 10, "stage"),
  ...Array.from({ length: 5 }, (_, index) => level(`pyp_${index + 1}`, `PYP ${index + 1}`, "IB Primary Years Programme", 20 + index * 10, "stage")),
  ...Array.from({ length: 5 }, (_, index) => level(`myp_${index + 1}`, `MYP ${index + 1}`, "IB Middle Years Programme", 70 + index * 10, "stage")),
  level("dp_1", "DP 1", "IB Diploma Programme", 120, "stage"),
  level("dp_2", "DP 2", "IB Diploma Programme", 130, "stage", { isTerminal: true }),
];

export const ACADEMIC_STRUCTURE_TEMPLATES: readonly AcademicStructureTemplate[] = [
  {
    key: "ghana_standard",
    name: "Ghana Standard",
    description: "Creche through SHS 3, with programme pathways available for senior high school.",
    levels: ghanaLevels,
    pathways: [
      { code: "GENERAL_SCIENCE", name: "General Science", category: "SHS Programme" },
      { code: "GENERAL_ARTS", name: "General Arts", category: "SHS Programme" },
      { code: "BUSINESS", name: "Business", category: "SHS Programme" },
      { code: "HOME_ECONOMICS", name: "Home Economics", category: "SHS Programme" },
      { code: "VISUAL_ARTS", name: "Visual Arts", category: "SHS Programme" },
      { code: "TECHNICAL_VOCATIONAL", name: "Technical / Vocational", category: "SHS Programme" },
    ],
    progression: linearProgression(ghanaLevels),
  },
  {
    key: "british",
    name: "British / Year System",
    description: "Nursery and Reception followed by Year 1 through Year 13.",
    levels: britishLevels,
    pathways: [],
    progression: linearProgression(britishLevels),
  },
  {
    key: "american",
    name: "American / Grade System",
    description: "Pre-K and Kindergarten followed by Grade 1 through Grade 12.",
    levels: americanLevels,
    pathways: [],
    progression: linearProgression(americanLevels),
  },
  {
    key: "cambridge",
    name: "Cambridge International",
    description: "Adaptable Cambridge-style stages from Early Years through Advanced level.",
    levels: cambridgeLevels,
    pathways: [],
    progression: linearProgression(cambridgeLevels),
  },
  {
    key: "montessori",
    name: "Montessori",
    description: "Age/stage-oriented Montessori structure that schools can rename or extend to match their programme.",
    levels: montessoriLevels,
    pathways: [],
    progression: linearProgression(montessoriLevels),
  },
  {
    key: "tvet",
    name: "TVET / Technical",
    description: "Programme-oriented foundation and competency levels, with pathway selection from Level 1.",
    levels: tvetLevels,
    pathways: [
      { code: "ENGINEERING", name: "Engineering", category: "TVET Programme" },
      { code: "ICT", name: "ICT", category: "TVET Programme" },
      { code: "CONSTRUCTION", name: "Construction", category: "TVET Programme" },
      { code: "HOSPITALITY", name: "Hospitality", category: "TVET Programme" },
      { code: "FASHION", name: "Fashion", category: "TVET Programme" },
      { code: "AGRICULTURE", name: "Agriculture", category: "TVET Programme" },
    ],
    progression: linearProgression(tvetLevels),
  },
  {
    key: "ib",
    name: "International Baccalaureate",
    description: "PYP, MYP and Diploma Programme stages in one configurable framework.",
    levels: ibLevels,
    pathways: [],
    progression: linearProgression(ibLevels),
  },
] as const;

export function validateAcademicStructureTemplate(template: AcademicStructureTemplate): void {
  if (template.levels.length < 1) throw new Error("Academic structure templates must contain at least one level.");
  const levelKeys = new Set<string>();
  const sequences = new Set<number>();
  for (const item of template.levels) {
    if (!item.key.trim() || !item.name.trim() || !item.phase.trim()) throw new Error("Every academic level needs a key, name and phase.");
    if (levelKeys.has(item.key)) throw new Error(`Duplicate academic level key: ${item.key}`);
    if (sequences.has(item.sequence)) throw new Error(`Duplicate academic level sequence: ${item.sequence}`);
    levelKeys.add(item.key);
    sequences.add(item.sequence);
  }

  const pathwayCodes = new Set(template.pathways.map((item) => item.code));
  if (pathwayCodes.size !== template.pathways.length) throw new Error("Academic pathway codes must be unique inside a template.");

  const defaults = new Set<string>();
  const defaultNext = new Map<string, string>();
  for (const rule of template.progression) {
    if (!levelKeys.has(rule.from)) throw new Error(`Unknown progression source: ${rule.from}`);
    if (rule.outcome === "advance") {
      if (!rule.to || !levelKeys.has(rule.to)) throw new Error(`Unknown progression target for ${rule.from}.`);
      if (rule.to === rule.from) throw new Error(`A level cannot progress to itself: ${rule.from}`);
    } else if (rule.to) {
      throw new Error(`Completion/exit rule ${rule.from} cannot have a target level.`);
    }
    if (rule.targetPathwayCode && !pathwayCodes.has(rule.targetPathwayCode)) throw new Error(`Unknown pathway ${rule.targetPathwayCode}.`);
    if (rule.isDefault) {
      if (defaults.has(rule.from)) throw new Error(`More than one default progression rule exists for ${rule.from}.`);
      defaults.add(rule.from);
      if (rule.outcome === "advance" && rule.to) defaultNext.set(rule.from, rule.to);
    }
  }

  for (const item of template.levels) {
    if (!template.progression.some((rule) => rule.from === item.key)) throw new Error(`Academic level ${item.key} has no progression or completion rule.`);
  }

  for (const start of defaultNext.keys()) {
    const visited = new Set<string>();
    let cursor: string | undefined = start;
    while (cursor && defaultNext.has(cursor)) {
      if (visited.has(cursor)) throw new Error(`Default academic progression contains a cycle at ${cursor}.`);
      visited.add(cursor);
      cursor = defaultNext.get(cursor);
    }
  }
}

for (const template of ACADEMIC_STRUCTURE_TEMPLATES) validateAcademicStructureTemplate(template);

export function listAcademicStructureTemplates() {
  return ACADEMIC_STRUCTURE_TEMPLATES.map(({ key, name, description, levels, pathways }) => ({
    key,
    name,
    description,
    levelCount: levels.length,
    pathwayCount: pathways.length,
    firstLevel: levels[0]?.name ?? null,
    terminalLevel: levels.at(-1)?.name ?? null,
  }));
}

export function getAcademicStructureTemplate(key: AcademicStructureTemplateKey): AcademicStructureTemplate {
  const template = ACADEMIC_STRUCTURE_TEMPLATES.find((item) => item.key === key);
  if (!template) throw new Error(`Unknown academic structure template: ${key}`);
  return template;
}
