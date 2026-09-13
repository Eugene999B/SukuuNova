export type RolloverOutcome = "promoted" | "retained" | "graduated" | "transferred" | "withdrawn" | "deferred";

export type RolloverGrade = {
  id: string;
  pathwayRequired: boolean;
};

export type RolloverRule = {
  fromGradeLevelId: string;
  toGradeLevelId: string | null;
  targetPathwayId: string | null;
  outcome: "advance" | "complete" | "exit";
  priority: number;
  isDefault: boolean;
};

export type RolloverSection = {
  id: string;
  gradeLevelId: string;
  pathwayId: string | null;
  displayName: string;
  capacity: number | null;
  classId: string;
};

export type RolloverDecision = {
  id: string;
  outcome: RolloverOutcome;
  targetGradeLevelId: string | null;
  targetPathwayId: string | null;
};

export type RolloverLearner = {
  studentId: string;
  sourceYearEnrollmentId: string;
  sourceGradeLevelId: string;
  sourcePathwayId: string | null;
  decision: RolloverDecision | null;
  targetYearAlreadyEnrolled?: boolean;
};

export type RolloverBlocker =
  | "NO_PROGRESSION_RULE"
  | "PATHWAY_REQUIRED"
  | "NO_TARGET_SECTION"
  | "SECTION_CAPACITY_EXCEEDED"
  | "DECISION_DEFERRED"
  | "TARGET_YEAR_ALREADY_ENROLLED";

export type PlannedRolloverItem = {
  studentId: string;
  sourceYearEnrollmentId: string;
  decisionId: string | null;
  sourceGradeLevelId: string;
  targetGradeLevelId: string | null;
  targetPathwayId: string | null;
  targetClassSectionId: string | null;
  targetClassId: string | null;
  outcome: RolloverOutcome;
  status: "ready" | "blocked";
  blockers: RolloverBlocker[];
};

export type AcademicRolloverPlan = {
  items: PlannedRolloverItem[];
  loads: Record<string, number>;
  summary: {
    total: number;
    ready: number;
    blocked: number;
    promoted: number;
    retained: number;
    graduated: number;
    transferred: number;
    withdrawn: number;
  };
};

function chooseDefaultRule(rules: RolloverRule[], sourceGradeLevelId: string): RolloverRule | null {
  const candidates = rules
    .filter((rule) => rule.fromGradeLevelId === sourceGradeLevelId && rule.isDefault)
    .sort((a, b) => a.priority - b.priority || (a.toGradeLevelId ?? "").localeCompare(b.toGradeLevelId ?? ""));
  return candidates[0] ?? null;
}

function compatibleSections(sections: RolloverSection[], gradeLevelId: string, pathwayId: string | null) {
  return sections.filter((section) => section.gradeLevelId === gradeLevelId && section.pathwayId === pathwayId);
}

function pickLeastLoadedSection(sections: RolloverSection[], loads: Map<string, number>): RolloverSection | null {
  const available = sections
    .filter((section) => section.capacity === null || (loads.get(section.id) ?? 0) < section.capacity)
    .sort((a, b) => {
      const loadDifference = (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0);
      return loadDifference || a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id);
    });
  return available[0] ?? null;
}

export function planAcademicYearRollover(input: {
  learners: RolloverLearner[];
  grades: RolloverGrade[];
  rules: RolloverRule[];
  sections: RolloverSection[];
  existingLoads?: Record<string, number>;
}): AcademicRolloverPlan {
  const grades = new Map(input.grades.map((grade) => [grade.id, grade]));
  const loads = new Map<string, number>(Object.entries(input.existingLoads ?? {}));
  const items: PlannedRolloverItem[] = [];

  for (const learner of input.learners) {
    const blockers: RolloverBlocker[] = [];
    let outcome: RolloverOutcome = learner.decision?.outcome ?? "promoted";
    let targetGradeLevelId = learner.decision?.targetGradeLevelId ?? null;
    let targetPathwayId = learner.decision?.targetPathwayId ?? learner.sourcePathwayId;

    if (learner.targetYearAlreadyEnrolled) blockers.push("TARGET_YEAR_ALREADY_ENROLLED");
    if (outcome === "deferred") blockers.push("DECISION_DEFERRED");

    const shouldResolveDefaultProgression = !learner.decision || (outcome === "promoted" && !targetGradeLevelId);
    if (shouldResolveDefaultProgression) {
      const rule = chooseDefaultRule(input.rules, learner.sourceGradeLevelId);
      if (!rule) {
        blockers.push("NO_PROGRESSION_RULE");
      } else if (rule.outcome === "complete") {
        outcome = "graduated";
        targetGradeLevelId = null;
        targetPathwayId = null;
      } else if (rule.outcome === "exit") {
        outcome = "transferred";
        targetGradeLevelId = null;
        targetPathwayId = null;
      } else {
        outcome = "promoted";
        targetGradeLevelId = rule.toGradeLevelId;
        targetPathwayId = learner.decision?.targetPathwayId ?? rule.targetPathwayId ?? learner.sourcePathwayId;
      }
    } else if (outcome === "retained") {
      targetGradeLevelId = learner.sourceGradeLevelId;
      targetPathwayId = learner.decision?.targetPathwayId ?? learner.sourcePathwayId;
    }

    if (["graduated", "transferred", "withdrawn"].includes(outcome)) {
      items.push({
        studentId: learner.studentId,
        sourceYearEnrollmentId: learner.sourceYearEnrollmentId,
        decisionId: learner.decision?.id ?? null,
        sourceGradeLevelId: learner.sourceGradeLevelId,
        targetGradeLevelId: null,
        targetPathwayId: null,
        targetClassSectionId: null,
        targetClassId: null,
        outcome,
        status: blockers.length ? "blocked" : "ready",
        blockers,
      });
      continue;
    }

    if (!targetGradeLevelId && !blockers.includes("NO_PROGRESSION_RULE")) blockers.push("NO_PROGRESSION_RULE");
    const targetGrade = targetGradeLevelId ? grades.get(targetGradeLevelId) : null;
    if (targetGrade?.pathwayRequired && !targetPathwayId) blockers.push("PATHWAY_REQUIRED");

    let selected: RolloverSection | null = null;
    if (targetGradeLevelId && (!targetGrade?.pathwayRequired || targetPathwayId)) {
      const candidates = compatibleSections(input.sections, targetGradeLevelId, targetPathwayId);
      if (!candidates.length) {
        blockers.push("NO_TARGET_SECTION");
      } else {
        selected = pickLeastLoadedSection(candidates, loads);
        if (!selected) blockers.push("SECTION_CAPACITY_EXCEEDED");
      }
    }

    if (!blockers.length && selected) loads.set(selected.id, (loads.get(selected.id) ?? 0) + 1);

    items.push({
      studentId: learner.studentId,
      sourceYearEnrollmentId: learner.sourceYearEnrollmentId,
      decisionId: learner.decision?.id ?? null,
      sourceGradeLevelId: learner.sourceGradeLevelId,
      targetGradeLevelId,
      targetPathwayId,
      targetClassSectionId: selected?.id ?? null,
      targetClassId: selected?.classId ?? null,
      outcome,
      status: blockers.length ? "blocked" : "ready",
      blockers,
    });
  }

  const count = (outcome: RolloverOutcome) => items.filter((item) => item.outcome === outcome).length;
  return {
    items,
    loads: Object.fromEntries(loads),
    summary: {
      total: items.length,
      ready: items.filter((item) => item.status === "ready").length,
      blocked: items.filter((item) => item.status === "blocked").length,
      promoted: count("promoted"),
      retained: count("retained"),
      graduated: count("graduated"),
      transferred: count("transferred"),
      withdrawn: count("withdrawn"),
    },
  };
}
