export type OversightWork = {
  id: string;
  assessmentId: string | null;
  classId: string;
  subjectId: string;
  teacherName: string | null;
  kind: string;
  title: string;
  workDate: string | null;
  weekNumber: number | null;
  maxScore: number;
  status: string;
};

export type OversightAssessment = {
  id: string;
  classId: string;
  subjectId: string;
  name: string;
  type: string;
  maxScore: number;
};

export type OversightScore = {
  assessmentId: string;
  studentId: string;
  value: number;
  status: string;
};

export type GradebookActivity = {
  assessmentId: string;
  workId: string | null;
  classId: string;
  subjectId: string;
  teacherName: string | null;
  title: string;
  kind: string;
  weekNumber: number | null;
  workDate: string | null;
  maxScore: number;
  status: string;
  entered: number;
  expected: number;
  missing: number;
  completionPct: number;
  averagePct: number | null;
  highestPct: number | null;
  lowestPct: number | null;
};

const titleCase = (value: string) => value
  .trim()
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function buildGradebookOversight(input: {
  works: OversightWork[];
  assessments: OversightAssessment[];
  scores: OversightScore[];
  rosterCounts: Record<string, number>;
}) {
  const workByAssessment = new Map(
    input.works.filter((work) => work.assessmentId).map((work) => [work.assessmentId as string, work]),
  );
  const scoresByAssessment = new Map<string, OversightScore[]>();
  for (const score of input.scores) {
    const rows = scoresByAssessment.get(score.assessmentId) ?? [];
    rows.push(score);
    scoresByAssessment.set(score.assessmentId, rows);
  }

  const activities: GradebookActivity[] = input.assessments.map((assessment) => {
    const work = workByAssessment.get(assessment.id) ?? null;
    const scores = scoresByAssessment.get(assessment.id) ?? [];
    const expected = input.rosterCounts[assessment.classId] ?? 0;
    const entered = Math.min(scores.length, expected || scores.length);
    const scorePercentages = scores
      .filter((score) => score.status !== "excused")
      .map((score) => assessment.maxScore > 0 ? (score.value / assessment.maxScore) * 100 : null)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const averagePct = scorePercentages.length
      ? scorePercentages.reduce((sum, value) => sum + value, 0) / scorePercentages.length
      : null;
    return {
      assessmentId: assessment.id,
      workId: work?.id ?? null,
      classId: assessment.classId,
      subjectId: assessment.subjectId,
      teacherName: work?.teacherName ?? null,
      title: work?.title || assessment.name,
      kind: work?.kind || titleCase(assessment.type),
      weekNumber: work?.weekNumber ?? null,
      workDate: work?.workDate ?? null,
      maxScore: assessment.maxScore,
      status: work?.status ?? "assessment",
      entered,
      expected,
      missing: Math.max(0, expected - entered),
      completionPct: expected ? Math.round((entered / expected) * 100) : 0,
      averagePct,
      highestPct: scorePercentages.length ? Math.max(...scorePercentages) : null,
      lowestPct: scorePercentages.length ? Math.min(...scorePercentages) : null,
    };
  });

  const countsByKind = activities.reduce<Record<string, number>>((counts, activity) => {
    const key = titleCase(activity.kind || "Assessment");
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const expectedEntries = activities.reduce((sum, activity) => sum + activity.expected, 0);
  const enteredEntries = activities.reduce((sum, activity) => sum + activity.entered, 0);
  const missingEntries = activities.reduce((sum, activity) => sum + activity.missing, 0);
  const completionPct = expectedEntries ? Math.round((enteredEntries / expectedEntries) * 100) : 0;

  return {
    activities,
    countsByKind,
    expectedEntries,
    enteredEntries,
    missingEntries,
    completionPct,
  };
}
