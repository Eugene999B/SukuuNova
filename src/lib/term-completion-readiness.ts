type SchoolClass = { id: string; name: string };
type TermStudent = { id: string; termClassId: string | null };
type CurriculumOffering = { classId: string; className: string; subjectId: string; subjectName: string };
type TeachingAssignment = { classId: string; subjectId: string; teacherId: string };
type TermAssessment = { id: string; classId: string; subjectId: string };
type TermScore = { assessmentId: string; studentId: string; status: string };
type TermReport = { studentId: string; status: string };

export type TermCompletionInput = {
  classes: SchoolClass[];
  students: TermStudent[];
  offerings: CurriculumOffering[];
  assignments: TeachingAssignment[];
  assessments: TermAssessment[];
  scores: TermScore[];
  reports: TermReport[];
  assessmentConfig: unknown;
};

export type TermCompletionReadiness = {
  summary: {
    activeClasses: number;
    activeStudents: number;
    unplacedStudents: number;
    curriculumSubjects: number;
    teachingAssignments: number;
    assessments: number;
    scoredEntries: number;
    excusedEntries: number;
    resolvedScoreEntries: number;
    reportCards: number;
    finalizedReports: number;
    releasedReports: number;
    missingScoreEntries: number;
  };
  blockers: {
    noActiveStudents: boolean;
    classesWithoutCurriculum: Array<{ classId: string; className: string }>;
    unstaffedSubjects: CurriculumOffering[];
    subjectsWithoutAssessments: CurriculumOffering[];
    missingScores: Array<{ classId: string; className: string; count: number }>;
    unplacedStudents: number;
    missingReports: number;
    draftReports: number;
    submittedReports: number;
    approvedAwaitingRelease: number;
    releasedReports: number;
    assessmentWeightTotal: number;
    assessmentWeightsValid: boolean;
  };
  classStudentCounts: Record<string, number>;
  attentionCount: number;
  readyForClose: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assessmentWeights(config: unknown) {
  const categories = isRecord(config) && Array.isArray(config.categories) ? config.categories : [];
  const weights = categories
    .filter(isRecord)
    .map((category) => Number(category.weight))
    .filter((weight) => Number.isFinite(weight) && weight >= 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return {
    total,
    valid: categories.length > 0 && weights.length === categories.length && Math.abs(total - 100) < 0.001,
  };
}

export function buildTermCompletionReadiness(input: TermCompletionInput): TermCompletionReadiness {
  const classById = new Map(input.classes.map((schoolClass) => [schoolClass.id, schoolClass]));
  const rosterStudents = input.students.filter((student) => Boolean(student.termClassId));
  const unplacedStudents = input.students.length - rosterStudents.length;
  const studentsByClass = new Map<string, TermStudent[]>();
  for (const student of rosterStudents) {
    const classId = student.termClassId as string;
    const rows = studentsByClass.get(classId) ?? [];
    rows.push(student);
    studentsByClass.set(classId, rows);
  }
  const activeClassIds = new Set(studentsByClass.keys());
  const activeOfferings = input.offerings.filter((offering) => activeClassIds.has(offering.classId));
  const offeringsByClass = new Map<string, CurriculumOffering[]>();
  for (const offering of activeOfferings) {
    const rows = offeringsByClass.get(offering.classId) ?? [];
    rows.push(offering);
    offeringsByClass.set(offering.classId, rows);
  }

  const classesWithoutCurriculum = [...activeClassIds]
    .filter((classId) => (offeringsByClass.get(classId) ?? []).length === 0)
    .map((classId) => ({ classId, className: classById.get(classId)?.name ?? "Unknown class" }))
    .sort((a, b) => a.className.localeCompare(b.className));

  const assignmentKeys = new Set(input.assignments.map((assignment) => `${assignment.classId}:${assignment.subjectId}`));
  const assessmentKeys = new Set(input.assessments.map((assessment) => `${assessment.classId}:${assessment.subjectId}`));
  const unstaffedSubjects = activeOfferings
    .filter((offering) => !assignmentKeys.has(`${offering.classId}:${offering.subjectId}`))
    .sort((a, b) => a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName));
  const subjectsWithoutAssessments = activeOfferings
    .filter((offering) => !assessmentKeys.has(`${offering.classId}:${offering.subjectId}`))
    .sort((a, b) => a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName));

  // Every persisted score row resolves a learner/assessment slot. In particular,
  // an excused learner is deliberately excluded from the average and must not be
  // reported as an unfinished mark.
  const resolvedScoreKeys = new Set(input.scores.map((score) => `${score.studentId}:${score.assessmentId}`));
  const missingScores: Array<{ classId: string; className: string; count: number }> = [];
  for (const classId of activeClassIds) {
    const classStudents = studentsByClass.get(classId) ?? [];
    const classAssessments = input.assessments.filter((assessment) => assessment.classId === classId);
    let count = 0;
    for (const student of classStudents) {
      for (const assessment of classAssessments) {
        if (!resolvedScoreKeys.has(`${student.id}:${assessment.id}`)) count += 1;
      }
    }
    if (count > 0) missingScores.push({ classId, className: classById.get(classId)?.name ?? "Unknown class", count });
  }
  missingScores.sort((a, b) => a.className.localeCompare(b.className));

  const rosterStudentIds = new Set(rosterStudents.map((student) => student.id));
  const reports = input.reports.filter((report) => rosterStudentIds.has(report.studentId));
  const reportByStudent = new Map(reports.map((report) => [report.studentId, report]));
  const missingReports = rosterStudents.filter((student) => !reportByStudent.has(student.id)).length;
  const draftReports = reports.filter((report) => report.status === "draft").length;
  const submittedReports = reports.filter((report) => report.status === "submitted").length;
  const approvedAwaitingRelease = reports.filter((report) => report.status === "approved").length;
  const releasedReports = reports.filter((report) => report.status === "sent").length;
  const finalizedReports = approvedAwaitingRelease + releasedReports;

  const weightState = assessmentWeights(input.assessmentConfig);
  const scoredEntries = input.scores.filter((score) => score.status !== "excused").length;
  const excusedEntries = input.scores.filter((score) => score.status === "excused").length;
  const missingScoreEntries = missingScores.reduce((sum, row) => sum + row.count, 0);
  const classStudentCounts = Object.fromEntries(
    [...studentsByClass.entries()].map(([classId, students]) => [classId, students.length]),
  );

  const attentionCount =
    (rosterStudents.length === 0 ? 1 : 0)
    + classesWithoutCurriculum.length
    + unstaffedSubjects.length
    + subjectsWithoutAssessments.length
    + missingScoreEntries
    + unplacedStudents
    + missingReports
    + draftReports
    + submittedReports
    + (weightState.valid ? 0 : 1);

  return {
    summary: {
      activeClasses: activeClassIds.size,
      activeStudents: rosterStudents.length,
      unplacedStudents,
      curriculumSubjects: activeOfferings.length,
      teachingAssignments: input.assignments.filter((assignment) => activeClassIds.has(assignment.classId)).length,
      assessments: input.assessments.filter((assessment) => activeClassIds.has(assessment.classId)).length,
      scoredEntries,
      excusedEntries,
      resolvedScoreEntries: input.scores.length,
      reportCards: reports.length,
      finalizedReports,
      releasedReports,
      missingScoreEntries,
    },
    blockers: {
      noActiveStudents: rosterStudents.length === 0,
      classesWithoutCurriculum,
      unstaffedSubjects,
      subjectsWithoutAssessments,
      missingScores,
      unplacedStudents,
      missingReports,
      draftReports,
      submittedReports,
      approvedAwaitingRelease,
      releasedReports,
      assessmentWeightTotal: weightState.total,
      assessmentWeightsValid: weightState.valid,
    },
    classStudentCounts,
    attentionCount,
    readyForClose: attentionCount === 0,
  };
}
