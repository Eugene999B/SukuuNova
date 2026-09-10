import type { TenantDb } from "@/lib/db";

export type GoLiveStepStatus = "complete" | "attention" | "blocked";

export type GoLiveStep = {
  key: string;
  title: string;
  description: string;
  status: GoLiveStepStatus;
  score: number;
  weight: number;
  detail: string;
  actionLabel: string;
  href: string;
};

export type GoLiveMetrics = {
  schoolActive: boolean;
  hasName: boolean;
  hasUniqueCode: boolean;
  hasLogo: boolean;
  hasBrandColors: boolean;
  hasSettings: boolean;
  hasCurrentAcademicYear: boolean;
  hasCurrentTerm: boolean;
  classCount: number;
  subjectCount: number;
  activeStaff: number;
  staffWithoutRole: number;
  staffNeedingPasswordChange: number;
  teachingAssignments: number;
  activeStudents: number;
  studentsWithoutClass: number;
  studentsWithoutGuardian: number;
  feeItemCount: number;
  communicationConfigured: boolean;
};

export type GoLiveReadiness = {
  generatedAt: string;
  score: number;
  readyToLaunch: boolean;
  blockerCount: number;
  attentionCount: number;
  steps: GoLiveStep[];
  metrics: GoLiveMetrics;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function weightedScore(weight: number, completion: number) {
  return Math.round(weight * clamp01(completion) * 100) / 100;
}

function step(input: Omit<GoLiveStep, "score"> & { completion: number }): GoLiveStep {
  return { ...input, score: weightedScore(input.weight, input.completion) };
}

export function evaluateGoLiveReadiness(metrics: GoLiveMetrics): GoLiveReadiness {
  const classCoverage = metrics.activeStudents > 0
    ? 1 - metrics.studentsWithoutClass / metrics.activeStudents
    : 0;
  const guardianCoverage = metrics.activeStudents > 0
    ? 1 - metrics.studentsWithoutGuardian / metrics.activeStudents
    : 0;
  const staffRoleCoverage = metrics.activeStaff > 0
    ? 1 - metrics.staffWithoutRole / metrics.activeStaff
    : 0;
  const firstLoginCoverage = metrics.activeStaff > 0
    ? 1 - metrics.staffNeedingPasswordChange / metrics.activeStaff
    : 0;

  const profileCompletion = [metrics.hasName, metrics.hasUniqueCode, metrics.hasLogo || metrics.hasBrandColors, metrics.hasSettings]
    .filter(Boolean).length / 4;
  const academicCompletion = [metrics.hasCurrentAcademicYear, metrics.hasCurrentTerm].filter(Boolean).length / 2;
  const staffCompletion = metrics.activeStaff > 0 ? (staffRoleCoverage * 0.7 + firstLoginCoverage * 0.3) : 0;
  const teachingCompletion = metrics.classCount > 0 && metrics.subjectCount > 0
    ? Math.min(1, metrics.teachingAssignments / Math.max(1, Math.min(metrics.classCount, metrics.subjectCount)))
    : 0;

  const steps: GoLiveStep[] = [
    step({
      key: "profile",
      title: "School profile & branding",
      description: "Confirm the school identity and the settings shared across SukuuNova.",
      status: !metrics.schoolActive || !metrics.hasSettings ? "blocked" : profileCompletion === 1 ? "complete" : "attention",
      completion: profileCompletion,
      weight: 8,
      detail: metrics.hasLogo || metrics.hasBrandColors ? "School identity and brand assets are available." : "Add a logo or brand colours before public-facing rollout.",
      actionLabel: "Open school settings",
      href: "/school/settings",
    }),
    step({
      key: "calendar",
      title: "Academic year & current term",
      description: "Give attendance, gradebook, reports and fees an authoritative school period.",
      status: metrics.hasCurrentAcademicYear && metrics.hasCurrentTerm ? "complete" : "blocked",
      completion: academicCompletion,
      weight: 14,
      detail: metrics.hasCurrentAcademicYear && metrics.hasCurrentTerm ? "A current academic year and term cover today." : "Create or correct the academic year and term dates that cover today.",
      actionLabel: "Open terms & calendar",
      href: "/school/terms",
    }),
    step({
      key: "classes",
      title: "Class structure",
      description: "Create the classes learners, attendance, fees and reports depend on.",
      status: metrics.classCount > 0 ? "complete" : "blocked",
      completion: metrics.classCount > 0 ? 1 : 0,
      weight: 9,
      detail: metrics.classCount > 0 ? `${metrics.classCount} class${metrics.classCount === 1 ? "" : "es"} configured.` : "No classes are configured yet.",
      actionLabel: "Manage classes",
      href: "/school/classes",
    }),
    step({
      key: "subjects",
      title: "Subjects",
      description: "Define the subjects used by teaching, timetable, assignments and gradebook.",
      status: metrics.subjectCount > 0 ? "complete" : "blocked",
      completion: metrics.subjectCount > 0 ? 1 : 0,
      weight: 8,
      detail: metrics.subjectCount > 0 ? `${metrics.subjectCount} subject${metrics.subjectCount === 1 ? "" : "s"} configured.` : "No subjects are configured yet.",
      actionLabel: "Manage subjects",
      href: "/school/subjects",
    }),
    step({
      key: "staff",
      title: "Staff access & security",
      description: "Make sure active staff have roles and have completed first-login security.",
      status: metrics.activeStaff === 0 ? "blocked" : metrics.staffWithoutRole === 0 && metrics.staffNeedingPasswordChange === 0 ? "complete" : "attention",
      completion: staffCompletion,
      weight: 12,
      detail: metrics.activeStaff === 0 ? "No active staff accounts are available." : `${metrics.activeStaff} active staff · ${metrics.staffWithoutRole} without roles · ${metrics.staffNeedingPasswordChange} pending password change.`,
      actionLabel: "Review people & access",
      href: "/school/settings/access",
    }),
    step({
      key: "teaching",
      title: "Teacher-class-subject connections",
      description: "Connect teachers to the classes and subjects they actually teach.",
      status: metrics.teachingAssignments > 0 ? "complete" : "blocked",
      completion: teachingCompletion,
      weight: 10,
      detail: metrics.teachingAssignments > 0 ? `${metrics.teachingAssignments} teaching assignment${metrics.teachingAssignments === 1 ? "" : "s"} configured.` : "No teaching assignments exist yet.",
      actionLabel: "Open academic setup",
      href: "/school/academics/setup",
    }),
    step({
      key: "students",
      title: "Learners & class coverage",
      description: "Make active learners operational by assigning them to their correct classes.",
      status: metrics.activeStudents === 0 || classCoverage === 0 ? "blocked" : classCoverage === 1 ? "complete" : "attention",
      completion: metrics.activeStudents > 0 ? classCoverage : 0,
      weight: 13,
      detail: metrics.activeStudents === 0 ? "No active learners have been added." : `${metrics.activeStudents - metrics.studentsWithoutClass} of ${metrics.activeStudents} active learners are assigned to a class.`,
      actionLabel: "Review learners",
      href: "/school/students",
    }),
    step({
      key: "guardians",
      title: "Guardian coverage",
      description: "Link families so report delivery, alerts and the Family Portal work reliably.",
      status: metrics.activeStudents === 0 ? "blocked" : guardianCoverage === 1 ? "complete" : guardianCoverage >= 0.8 ? "attention" : "blocked",
      completion: metrics.activeStudents > 0 ? guardianCoverage : 0,
      weight: 11,
      detail: metrics.activeStudents === 0 ? "Add learners before checking guardian coverage." : `${metrics.activeStudents - metrics.studentsWithoutGuardian} of ${metrics.activeStudents} learners have at least one guardian link.`,
      actionLabel: "Review guardians",
      href: "/school/guardians",
    }),
    step({
      key: "fees",
      title: "Fee structure",
      description: "Prepare at least one fee item for the current operating period.",
      status: metrics.feeItemCount > 0 ? "complete" : "attention",
      completion: metrics.feeItemCount > 0 ? 1 : 0,
      weight: 8,
      detail: metrics.feeItemCount > 0 ? `${metrics.feeItemCount} fee item${metrics.feeItemCount === 1 ? "" : "s"} configured.` : "No fee items are configured for the current term.",
      actionLabel: "Open school fees",
      href: "/school/fees",
    }),
    step({
      key: "communications",
      title: "Communication channel",
      description: "Prepare at least one school communication path before parent-facing rollout.",
      status: metrics.communicationConfigured ? "complete" : "attention",
      completion: metrics.communicationConfigured ? 1 : 0,
      weight: 7,
      detail: metrics.communicationConfigured ? "At least one communication configuration is present." : "Configure SMS, WhatsApp or notification settings before wider rollout.",
      actionLabel: "Communication settings",
      href: "/school/communications/settings",
    }),
  ];

  const score = Math.round(steps.reduce((sum, current) => sum + current.score, 0));
  const blockerCount = steps.filter((current) => current.status === "blocked").length;
  const attentionCount = steps.filter((current) => current.status === "attention").length;
  return {
    generatedAt: new Date().toISOString(),
    score,
    readyToLaunch: score >= 90 && blockerCount === 0,
    blockerCount,
    attentionCount,
    steps,
    metrics,
  };
}

function jsonConfigured(value: unknown) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return Boolean(value);
}

export async function getSchoolGoLiveReadiness(tx: TenantDb, schoolId: string): Promise<GoLiveReadiness> {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const [
    school,
    settings,
    currentAcademicYear,
    currentTerm,
    classCount,
    subjectCount,
    activeStaff,
    staffWithoutRole,
    staffNeedingPasswordChange,
    teachingAssignments,
    activeStudents,
    studentsWithoutClass,
    studentsWithoutGuardian,
  ] = await Promise.all([
    tx.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, uniqueCode: true, status: true, logoUrl: true, brandColors: true } }),
    tx.schoolSettings.findUnique({ where: { schoolId }, select: { schoolId: true, smsSenderId: true, notificationChannels: true, whatsappTemplateConfig: true } }),
    tx.academicYear.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } }, select: { id: true } }),
    tx.term.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } }, select: { id: true } }),
    tx.class.count(),
    tx.subject.count(),
    tx.user.count({ where: { status: "active" } }),
    tx.user.count({ where: { status: "active", userRoles: { none: {} } } }),
    tx.user.count({ where: { status: "active", needsPasswordChange: true } }),
    tx.classSubjectTeacher.count(),
    tx.student.count({ where: { status: "active" } }),
    tx.student.count({ where: { status: "active", classId: null } }),
    tx.student.count({ where: { status: "active", guardians: { none: {} } } }),
  ]);

  const feeItemCount = currentTerm
    ? await tx.feeItem.count({ where: { termId: currentTerm.id } })
    : 0;
  const communicationConfigured = Boolean(settings?.smsSenderId?.trim())
    || jsonConfigured(settings?.notificationChannels)
    || jsonConfigured(settings?.whatsappTemplateConfig);

  return evaluateGoLiveReadiness({
    schoolActive: school?.status === "active",
    hasName: Boolean(school?.name?.trim()),
    hasUniqueCode: Boolean(school?.uniqueCode?.trim()),
    hasLogo: Boolean(school?.logoUrl?.trim()),
    hasBrandColors: jsonConfigured(school?.brandColors),
    hasSettings: Boolean(settings),
    hasCurrentAcademicYear: Boolean(currentAcademicYear),
    hasCurrentTerm: Boolean(currentTerm),
    classCount,
    subjectCount,
    activeStaff,
    staffWithoutRole,
    staffNeedingPasswordChange,
    teachingAssignments,
    activeStudents,
    studentsWithoutClass,
    studentsWithoutGuardian,
    feeItemCount,
    communicationConfigured,
  });
}
