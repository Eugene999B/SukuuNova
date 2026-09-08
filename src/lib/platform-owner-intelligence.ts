import { db, withTenant } from "@/lib/db";
import { isAttendanceBlocked } from "@/lib/attendance-service";

export type PlatformIssueSeverity = "critical" | "warning" | "info";
export type PlatformIssueCategory = "access" | "setup" | "academics" | "attendance" | "family" | "commercial";

export type PlatformSchoolIssue = {
  code: string;
  category: PlatformIssueCategory;
  severity: PlatformIssueSeverity;
  title: string;
  detail: string;
  action: string;
  attentionPoints: number;
  readinessPoints: number;
};

export type PlatformSchoolMetrics = {
  schoolStatus: string;
  directoryStatus: string;
  activeStudents: number;
  studentsWithoutClass: number;
  studentsWithoutGuardian: number;
  activeUsers: number;
  usersWithoutRoles: number;
  usersNeedingPasswordChange: number;
  classCount: number;
  classesWithoutTeacher: number;
  subjectCount: number;
  teachingAssignments: number;
  hasSchoolSettings: boolean;
  currentAcademicYear: boolean;
  currentTerm: boolean;
  assessmentsInCurrentTerm: number;
  reportsInCurrentTerm: number;
  expectedSchoolDay: boolean;
  studentsPresentToday: number;
  unpaidInvoices: number;
};

export type PlatformSchoolIntelligence = {
  schoolId: string;
  name: string;
  uniqueCode: string;
  status: string;
  directoryStatus: string;
  attentionScore: number;
  readinessScore: number;
  health: "critical" | "watch" | "healthy";
  metrics: PlatformSchoolMetrics;
  issues: PlatformSchoolIssue[];
  recommendedAction: string;
};

export type PlatformOwnerIntelligence = {
  generatedAt: string;
  summary: {
    schools: number;
    criticalSchools: number;
    watchSchools: number;
    healthySchools: number;
    averageReadiness: number;
    criticalIssues: number;
    warningIssues: number;
    accessRisks: number;
    academicRisks: number;
    attendanceRisks: number;
    familyRisks: number;
    commercialRisks: number;
  };
  categoryCounts: Record<PlatformIssueCategory, number>;
  schools: PlatformSchoolIntelligence[];
};

const severityRank: Record<PlatformIssueSeverity, number> = { critical: 3, warning: 2, info: 1 };

function issue(input: PlatformSchoolIssue): PlatformSchoolIssue {
  return input;
}

export function evaluateSchoolIntelligence(metrics: PlatformSchoolMetrics) {
  const issues: PlatformSchoolIssue[] = [];
  const add = (value: PlatformSchoolIssue) => issues.push(issue(value));

  if (metrics.schoolStatus !== "active" || metrics.directoryStatus !== "active") {
    add({
      code: "school_access_disabled",
      category: "access",
      severity: "critical",
      title: "School access is not fully active",
      detail: `School status is ${metrics.schoolStatus}; login directory is ${metrics.directoryStatus}.`,
      action: "Review account status and restore access only after confirming the reason for suspension.",
      attentionPoints: 45,
      readinessPoints: 18,
    });
  }

  if (metrics.activeUsers === 0) {
    add({
      code: "no_active_accounts",
      category: "access",
      severity: "critical",
      title: "No active school accounts",
      detail: "The school cannot operate normally because there are no active user accounts.",
      action: "Create or reactivate the school owner/principal account and verify login access.",
      attentionPoints: 28,
      readinessPoints: 24,
    });
  }

  if (metrics.usersWithoutRoles > 0) {
    add({
      code: "accounts_without_roles",
      category: "access",
      severity: metrics.usersWithoutRoles >= 3 ? "critical" : "warning",
      title: `${metrics.usersWithoutRoles} active account${metrics.usersWithoutRoles === 1 ? "" : "s"} without roles`,
      detail: "These accounts can exist but do not have a clear responsibility bundle.",
      action: "Assign an appropriate system or custom role, then review effective permissions.",
      attentionPoints: Math.min(18, 5 + metrics.usersWithoutRoles * 3),
      readinessPoints: Math.min(16, 4 + metrics.usersWithoutRoles * 2),
    });
  }

  if (metrics.usersNeedingPasswordChange > 0) {
    add({
      code: "pending_first_login_security",
      category: "access",
      severity: "info",
      title: `${metrics.usersNeedingPasswordChange} account${metrics.usersNeedingPasswordChange === 1 ? "" : "s"} still require a password change`,
      detail: "These users may not have completed their first-login security step.",
      action: "Confirm the users can sign in and complete their required password change.",
      attentionPoints: Math.min(8, 2 + metrics.usersNeedingPasswordChange),
      readinessPoints: Math.min(6, metrics.usersNeedingPasswordChange),
    });
  }

  if (metrics.activeStudents > 0 && metrics.classCount === 0) {
    add({
      code: "students_without_class_structure",
      category: "setup",
      severity: "critical",
      title: "Learners exist but no classes are configured",
      detail: `${metrics.activeStudents} active learner${metrics.activeStudents === 1 ? "" : "s"} cannot be connected to academic workflows without classes.`,
      action: "Create the school class structure before continuing academic setup.",
      attentionPoints: 24,
      readinessPoints: 26,
    });
  } else if (metrics.studentsWithoutClass > 0) {
    add({
      code: "students_without_class",
      category: "setup",
      severity: metrics.studentsWithoutClass >= 5 ? "critical" : "warning",
      title: `${metrics.studentsWithoutClass} learner${metrics.studentsWithoutClass === 1 ? "" : "s"} not assigned to a class`,
      detail: "Unassigned learners will be missed by attendance, gradebook, timetable and class communication workflows.",
      action: "Assign each active learner to the correct class.",
      attentionPoints: Math.min(22, 7 + metrics.studentsWithoutClass * 2),
      readinessPoints: Math.min(22, 7 + metrics.studentsWithoutClass * 2),
    });
  }

  if (metrics.classCount > 0 && metrics.classesWithoutTeacher > 0) {
    add({
      code: "classes_without_class_teacher",
      category: "academics",
      severity: metrics.classesWithoutTeacher === metrics.classCount ? "critical" : "warning",
      title: `${metrics.classesWithoutTeacher} class${metrics.classesWithoutTeacher === 1 ? "" : "es"} without a class teacher`,
      detail: "Class ownership is incomplete, affecting attendance, report remarks and parent communication.",
      action: "Assign a class teacher to every active class.",
      attentionPoints: Math.min(18, 6 + metrics.classesWithoutTeacher * 2),
      readinessPoints: Math.min(18, 6 + metrics.classesWithoutTeacher * 2),
    });
  }

  if (metrics.classCount > 0 && metrics.subjectCount > 0 && metrics.teachingAssignments === 0) {
    add({
      code: "no_teaching_assignments",
      category: "academics",
      severity: "critical",
      title: "No teacher-class-subject assignments",
      detail: "Subjects and classes exist, but teachers are not connected to what they teach.",
      action: "Create teaching assignments so timetable, gradebook, assignments and lesson planning can work correctly.",
      attentionPoints: 22,
      readinessPoints: 24,
    });
  }

  if (!metrics.currentAcademicYear) {
    add({
      code: "no_current_academic_year",
      category: "setup",
      severity: "warning",
      title: "No academic year covers today",
      detail: "The school calendar does not currently resolve to an active academic year period.",
      action: "Review academic-year dates and make sure the current school year is configured.",
      attentionPoints: 11,
      readinessPoints: 14,
    });
  }

  if (!metrics.currentTerm) {
    add({
      code: "no_current_term",
      category: "academics",
      severity: "warning",
      title: "No term covers today",
      detail: "Term-aware gradebook, reports and academic workflows do not have a current period.",
      action: "Create or correct the current term dates.",
      attentionPoints: 13,
      readinessPoints: 16,
    });
  }

  if (!metrics.hasSchoolSettings) {
    add({
      code: "school_settings_missing",
      category: "setup",
      severity: "critical",
      title: "School settings record is missing",
      detail: "Core defaults such as timezone, grading, attendance and report configuration cannot be trusted.",
      action: "Repair the school settings record before allowing normal operation.",
      attentionPoints: 26,
      readinessPoints: 28,
    });
  }

  if (metrics.activeStudents > 0 && metrics.studentsWithoutGuardian > 0) {
    add({
      code: "students_without_guardian",
      category: "family",
      severity: metrics.studentsWithoutGuardian >= 10 ? "critical" : "warning",
      title: `${metrics.studentsWithoutGuardian} learner${metrics.studentsWithoutGuardian === 1 ? "" : "s"} without a guardian link`,
      detail: "Guardian portal access, report delivery, alerts and family communication are incomplete for these learners.",
      action: "Link at least one guardian to every active learner and verify guardian contact information.",
      attentionPoints: Math.min(18, 5 + Math.ceil(metrics.studentsWithoutGuardian / 2)),
      readinessPoints: Math.min(16, 5 + Math.ceil(metrics.studentsWithoutGuardian / 2)),
    });
  }

  if (metrics.expectedSchoolDay && metrics.activeStudents > 0) {
    const attendanceCoverage = Math.round((metrics.studentsPresentToday / metrics.activeStudents) * 100);
    if (metrics.studentsPresentToday === 0) {
      add({
        code: "no_attendance_today",
        category: "attendance",
        severity: "warning",
        title: "No learner attendance recorded today",
        detail: "Today is a configured school day, but no active learner has a check-in record.",
        action: "Check attendance setup, devices and class-teacher workflow, then confirm whether school is actually in session.",
        attentionPoints: 16,
        readinessPoints: 7,
      });
    } else if (attendanceCoverage < 50) {
      add({
        code: "low_attendance_coverage_today",
        category: "attendance",
        severity: "warning",
        title: `Only ${attendanceCoverage}% of active learners have attendance today`,
        detail: `${metrics.studentsPresentToday} of ${metrics.activeStudents} active learners currently have an attendance entry.`,
        action: "Check which classes have not submitted attendance and follow up with the responsible staff.",
        attentionPoints: 10,
        readinessPoints: 4,
      });
    }
  }

  if (metrics.currentTerm && metrics.classCount > 0 && metrics.subjectCount > 0 && metrics.assessmentsInCurrentTerm === 0) {
    add({
      code: "no_assessments_current_term",
      category: "academics",
      severity: "info",
      title: "No assessments exist in the current term",
      detail: "The gradebook has no homework, classwork, exercise, project or examination records for the current term.",
      action: "Confirm teachers have started creating assessments and entering marks for the current term.",
      attentionPoints: 6,
      readinessPoints: 5,
    });
  }

  if (metrics.unpaidInvoices > 0) {
    add({
      code: "platform_invoices_unpaid",
      category: "commercial",
      severity: metrics.unpaidInvoices >= 3 ? "critical" : "warning",
      title: `${metrics.unpaidInvoices} platform invoice${metrics.unpaidInvoices === 1 ? "" : "s"} with balance`,
      detail: "The school's commercial account requires review.",
      action: "Open the school billing history, confirm the balance and reconcile or follow up as appropriate.",
      attentionPoints: Math.min(22, 7 + metrics.unpaidInvoices * 5),
      readinessPoints: 0,
    });
  }

  issues.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.attentionPoints - a.attentionPoints || a.title.localeCompare(b.title));
  const attentionScore = Math.min(100, issues.reduce((sum, current) => sum + current.attentionPoints, 0));
  const readinessPenalty = Math.min(100, issues.reduce((sum, current) => sum + current.readinessPoints, 0));
  const readinessScore = Math.max(0, 100 - readinessPenalty);
  const health: PlatformSchoolIntelligence["health"] = attentionScore >= 55 || issues.some((current) => current.severity === "critical")
    ? "critical"
    : attentionScore >= 18 || issues.some((current) => current.severity === "warning")
      ? "watch"
      : "healthy";
  return {
    issues,
    attentionScore,
    readinessScore,
    health,
    recommendedAction: issues[0]?.action ?? "No urgent intervention is currently suggested. Continue normal monitoring.",
  };
}

function numberFromCount(rows: Array<{ count: bigint | number | string }>) {
  return Number(rows[0]?.count ?? 0);
}

async function inspectSchool(schoolId: string, directoryStatus: string): Promise<PlatformSchoolIntelligence> {
  try {
    const data = await withTenant(schoolId, async (tx) => {
      const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
      const weekday = today.getUTCDay();
      const [
        school,
        settings,
        activeStudents,
        studentsWithoutClass,
        activeUsers,
        usersNeedingPasswordChange,
        classCount,
        classesWithoutTeacher,
        subjectCount,
        teachingAssignments,
        currentAcademicYear,
        currentTerm,
        studentsWithoutGuardianRows,
        usersWithoutRolesRows,
        attendanceRows,
        invoiceRows,
      ] = await Promise.all([
        tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true, status: true } }),
        tx.schoolSettings.findUnique({ where: { schoolId }, select: { schoolId: true } }),
        tx.student.count({ where: { status: "active" } }),
        tx.student.count({ where: { status: "active", classId: null } }),
        tx.user.count({ where: { status: "active" } }),
        tx.user.count({ where: { status: "active", needsPasswordChange: true } }),
        tx.class.count(),
        tx.class.count({ where: { classTeacherId: null } }),
        tx.subject.count(),
        tx.classSubjectTeacher.count(),
        tx.academicYear.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } }, select: { id: true } }),
        tx.term.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } }, select: { id: true } }),
        tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "Student" s
          WHERE s."schoolId" = ${schoolId}
            AND s."status" = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM "StudentGuardian" sg
              WHERE sg."schoolId" = ${schoolId} AND sg."studentId" = s."id"
            )
        `,
        tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "User" u
          WHERE u."schoolId" = ${schoolId}
            AND u."status" = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM "UserRole" ur
              WHERE ur."schoolId" = ${schoolId} AND ur."userId" = u."id"
            )
        `,
        tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(DISTINCT "studentId")::bigint AS count
          FROM "AttendanceEvent"
          WHERE "schoolId" = ${schoolId}
            AND "attendanceDate" = ${today}
            AND "studentId" IS NOT NULL
            AND "type" = 'in'
        `,
        tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT "status" FROM "PlatformInvoice" WHERE "schoolId"=$1`, schoolId),
      ]);
      if (!school) throw new Error("School record not found");
      const blocked = weekday === 0 || weekday === 6 ? true : await isAttendanceBlocked(tx, schoolId, today);
      const assessmentsInCurrentTerm = currentTerm ? await tx.assessment.count({ where: { termId: currentTerm.id } }) : 0;
      const reportsInCurrentTerm = currentTerm ? await tx.reportCard.count({ where: { termId: currentTerm.id } }) : 0;
      const metrics: PlatformSchoolMetrics = {
        schoolStatus: school.status,
        directoryStatus,
        activeStudents,
        studentsWithoutClass,
        studentsWithoutGuardian: numberFromCount(studentsWithoutGuardianRows),
        activeUsers,
        usersWithoutRoles: numberFromCount(usersWithoutRolesRows),
        usersNeedingPasswordChange,
        classCount,
        classesWithoutTeacher,
        subjectCount,
        teachingAssignments,
        hasSchoolSettings: Boolean(settings),
        currentAcademicYear: Boolean(currentAcademicYear),
        currentTerm: Boolean(currentTerm),
        assessmentsInCurrentTerm,
        reportsInCurrentTerm,
        expectedSchoolDay: !blocked,
        studentsPresentToday: numberFromCount(attendanceRows),
        unpaidInvoices: invoiceRows.filter((row) => row.status !== "paid").length,
      };
      return { school, metrics };
    });
    const evaluated = evaluateSchoolIntelligence(data.metrics);
    return {
      schoolId: data.school.id,
      name: data.school.name,
      uniqueCode: data.school.uniqueCode,
      status: data.school.status,
      directoryStatus,
      ...evaluated,
      metrics: data.metrics,
    };
  } catch {
    const metrics: PlatformSchoolMetrics = {
      schoolStatus: "unknown",
      directoryStatus,
      activeStudents: 0,
      studentsWithoutClass: 0,
      studentsWithoutGuardian: 0,
      activeUsers: 0,
      usersWithoutRoles: 0,
      usersNeedingPasswordChange: 0,
      classCount: 0,
      classesWithoutTeacher: 0,
      subjectCount: 0,
      teachingAssignments: 0,
      hasSchoolSettings: false,
      currentAcademicYear: false,
      currentTerm: false,
      assessmentsInCurrentTerm: 0,
      reportsInCurrentTerm: 0,
      expectedSchoolDay: false,
      studentsPresentToday: 0,
      unpaidInvoices: 0,
    };
    return {
      schoolId,
      name: "Unavailable school",
      uniqueCode: schoolId.slice(0, 8),
      status: "unknown",
      directoryStatus,
      attentionScore: 100,
      readinessScore: 0,
      health: "critical",
      metrics,
      issues: [{
        code: "school_inspection_failed",
        category: "setup",
        severity: "critical",
        title: "School could not be inspected",
        detail: "The platform could not safely read this tenant's operational data.",
        action: "Open School 360 and investigate tenant availability, database integrity and school setup before making changes.",
        attentionPoints: 100,
        readinessPoints: 100,
      }],
      recommendedAction: "Open School 360 and investigate tenant availability, database integrity and school setup before making changes.",
    };
  }
}

export async function getPlatformOwnerIntelligence(input?: { schoolIds?: string[] | null }): Promise<PlatformOwnerIntelligence> {
  const requested = input?.schoolIds ?? null;
  const directories = await db.schoolLoginDirectory.findMany({
    where: requested ? { schoolId: { in: requested } } : undefined,
    orderBy: { createdAt: "desc" },
    select: { schoolId: true, status: true },
  });
  const schools = await Promise.all(directories.map((directory) => inspectSchool(directory.schoolId, directory.status)));
  schools.sort((a, b) => b.attentionScore - a.attentionScore || a.name.localeCompare(b.name));

  const categoryCounts: Record<PlatformIssueCategory, number> = { access: 0, setup: 0, academics: 0, attendance: 0, family: 0, commercial: 0 };
  let criticalIssues = 0;
  let warningIssues = 0;
  for (const school of schools) {
    for (const current of school.issues) {
      categoryCounts[current.category] += 1;
      if (current.severity === "critical") criticalIssues += 1;
      if (current.severity === "warning") warningIssues += 1;
    }
  }
  const averageReadiness = schools.length ? Math.round(schools.reduce((sum, school) => sum + school.readinessScore, 0) / schools.length) : 100;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      schools: schools.length,
      criticalSchools: schools.filter((school) => school.health === "critical").length,
      watchSchools: schools.filter((school) => school.health === "watch").length,
      healthySchools: schools.filter((school) => school.health === "healthy").length,
      averageReadiness,
      criticalIssues,
      warningIssues,
      accessRisks: categoryCounts.access,
      academicRisks: categoryCounts.academics + categoryCounts.setup,
      attendanceRisks: categoryCounts.attendance,
      familyRisks: categoryCounts.family,
      commercialRisks: categoryCounts.commercial,
    },
    categoryCounts,
    schools,
  };
}
