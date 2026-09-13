import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { syncTermWeeks } from "@/lib/term-teaching-weeks";
import {
  ACADEMIC_CALENDAR_PATTERNS,
  buildSchoolCalendarDays,
  getAcademicCalendarPattern,
  validateAcademicYearSessions,
  vacationWindows,
  type AcademicCalendarPatternKey,
  type AcademicSessionDraft,
  type SchoolCalendarDayType,
} from "@/lib/academic-calendar-patterns";

export type AcademicSessionPlanInput = AcademicSessionDraft & {
  teacherMarksCloseAt?: string | Date | null;
  classTeacherReviewCloseAt?: string | Date | null;
  reportApprovalAt?: string | Date | null;
  reportReleaseAt?: string | Date | null;
  lockTargetAt?: string | Date | null;
};

type SessionPolicyRow = {
  id: string;
  academicYearPlanId: string;
  academicYearId: string;
  termId: string;
  sequence: number;
  sessionKind: string;
  isYearEnd: boolean;
  closingStatus: "open" | "closing" | "ready" | "locked";
  teacherMarksCloseAt: Date | null;
  classTeacherReviewCloseAt: Date | null;
  reportApprovalAt: Date | null;
  reportReleaseAt: Date | null;
  lockTargetAt: Date | null;
};

type PlanRow = { id: string; academicYearId: string; patternKey: AcademicCalendarPatternKey; status: string };
type CalendarDayRow = { calendarDate: Date; dayType: string; isInstructional: boolean; label: string | null; source: string };

function date(value: string | Date, label: string) {
  const parsed = value instanceof Date ? new Date(value) : new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new AppError(`${label} is invalid.`, 400, "ACADEMIC_CALENDAR_INVALID");
  return parsed;
}

function optionalDate(value?: string | Date | null) {
  return value ? date(value, "Deadline") : null;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function advisoryLock(tx: TenantDb, key: string) {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, key);
}

export function listAcademicCalendarPatterns() {
  return ACADEMIC_CALENDAR_PATTERNS.map((pattern) => ({ ...pattern }));
}

export async function getAcademicCalendarState(tx: TenantDb, schoolId: string) {
  const [years, plans, policies, days, gradingPeriods] = await Promise.all([
    tx.academicYear.findMany({
      where: { schoolId },
      include: { terms: { orderBy: { startDate: "asc" } } },
      orderBy: { startDate: "desc" },
    }),
    tx.$queryRawUnsafe<PlanRow[]>(`SELECT "id","academicYearId","patternKey","status" FROM "AcademicYearPlan" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC`, schoolId),
    tx.$queryRawUnsafe<SessionPolicyRow[]>(`SELECT "id","academicYearPlanId","academicYearId","termId","sequence","sessionKind","isYearEnd","closingStatus","teacherMarksCloseAt","classTeacherReviewCloseAt","reportApprovalAt","reportReleaseAt","lockTargetAt" FROM "AcademicSessionPolicy" WHERE "schoolId"=$1 ORDER BY "academicYearId","sequence"`, schoolId),
    tx.$queryRawUnsafe<Array<{ academicYearId: string; total: bigint; instructional: bigint; vacation: bigint; holidays: bigint }>>(
      `SELECT "academicYearId",COUNT(*)::bigint AS "total",COUNT(*) FILTER (WHERE "isInstructional")::bigint AS "instructional",COUNT(*) FILTER (WHERE "dayType"='vacation')::bigint AS "vacation",COUNT(*) FILTER (WHERE "dayType" IN ('public_holiday','mid_term_break','closure'))::bigint AS "holidays" FROM "SchoolCalendarDay" WHERE "schoolId"=$1 GROUP BY "academicYearId"`,
      schoolId,
    ),
    tx.$queryRawUnsafe<Array<{ id: string; academicYearId: string; termId: string; name: string; sequence: number; startDate: Date; endDate: Date; isFinal: boolean; status: string }>>(
      `SELECT "id","academicYearId","termId","name","sequence","startDate","endDate","isFinal","status" FROM "GradingPeriod" WHERE "schoolId"=$1 ORDER BY "academicYearId","termId","sequence"`,
      schoolId,
    ),
  ]);
  const planByYear = new Map(plans.map((item) => [item.academicYearId, item]));
  const policyByTerm = new Map(policies.map((item) => [item.termId, item]));
  const dayByYear = new Map(days.map((item) => [item.academicYearId, {
    total: Number(item.total), instructional: Number(item.instructional), vacation: Number(item.vacation), holidays: Number(item.holidays),
  }]));
  return {
    patterns: listAcademicCalendarPatterns(),
    years: years.map((year, index) => ({
      ...year,
      plan: planByYear.get(year.id) ?? null,
      calendarSummary: dayByYear.get(year.id) ?? { total: 0, instructional: 0, vacation: 0, holidays: 0 },
      nextAcademicYear: index > 0 ? { id: years[index - 1].id, name: years[index - 1].name, startDate: years[index - 1].startDate } : null,
      terms: year.terms.map((term) => ({ ...term, policy: policyByTerm.get(term.id) ?? null })),
    })),
    gradingPeriods,
  };
}

export async function refreshAcademicCalendarDays(tx: TenantDb, input: { schoolId: string; academicYearId: string }) {
  const [year, events] = await Promise.all([
    tx.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: input.schoolId }, include: { terms: { orderBy: { startDate: "asc" } } } }),
    tx.calendarEvent.findMany({ where: { schoolId: input.schoolId, academicYearId: input.academicYearId }, orderBy: { startDate: "asc" } }),
  ]);
  if (!year) throw new AppError("Academic year not found.", 404, "ACADEMIC_YEAR_NOT_FOUND");
  const generated = buildSchoolCalendarDays({
    yearStart: year.startDate,
    yearEnd: year.endDate,
    sessions: year.terms.map((term) => ({ name: term.name, startDate: term.startDate, endDate: term.endDate })),
    events: events.map((event) => ({
      name: event.name,
      type: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
      affectsAttendance: event.affectsAttendance,
      affectsTransport: event.affectsTransport,
    })),
  });
  await tx.$executeRawUnsafe(`DELETE FROM "SchoolCalendarDay" WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "source"='generated'`, input.schoolId, input.academicYearId);
  if (generated.length) {
    const payload = generated.map((item) => ({ id: createId(), ...item }));
    await tx.$executeRawUnsafe(
      `INSERT INTO "SchoolCalendarDay" ("id","schoolId","academicYearId","calendarDate","dayType","label","isInstructional","affectsAttendance","affectsTransport","source")
       SELECT x."id",$2,$3,x."date"::date,x."dayType",x."label",x."isInstructional",x."affectsAttendance",x."affectsTransport",'generated'
       FROM jsonb_to_recordset($1::jsonb) AS x("id" text,"date" text,"dayType" text,"label" text,"isInstructional" boolean,"affectsAttendance" boolean,"affectsTransport" boolean)
       ON CONFLICT ("schoolId","academicYearId","calendarDate") DO NOTHING`,
      JSON.stringify(payload), input.schoolId, input.academicYearId,
    );
  }
  const rows = await tx.$queryRawUnsafe<CalendarDayRow[]>(
    `SELECT "calendarDate","dayType","isInstructional","label","source" FROM "SchoolCalendarDay" WHERE "schoolId"=$1 AND "academicYearId"=$2 ORDER BY "calendarDate"`,
    input.schoolId, input.academicYearId,
  );
  const normalized = rows.map((row) => ({ date: dateKey(row.calendarDate), dayType: row.dayType, label: row.label, isInstructional: row.isInstructional }));
  return {
    days: normalized,
    vacations: vacationWindows(normalized.map((item) => ({ ...item, dayType: item.dayType as SchoolCalendarDayType, affectsAttendance: true, affectsTransport: false }))),
    instructionalDays: rows.filter((row) => row.isInstructional).length,
  };
}

export async function createAcademicYearPlan(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  name: string;
  startDate: string | Date;
  endDate: string | Date;
  patternKey: AcademicCalendarPatternKey;
  sessions: AcademicSessionPlanInput[];
}) {
  const name = input.name.trim();
  if (!name) throw new AppError("Academic year name is required.", 400, "ACADEMIC_CALENDAR_INVALID");
  const startDate = date(input.startDate, "Academic year start date");
  const endDate = date(input.endDate, "Academic year end date");
  const pattern = getAcademicCalendarPattern(input.patternKey);
  const sessions = input.sessions.map((session) => ({
    ...session,
    name: session.name.trim(),
    startDate: date(session.startDate, `${session.name || "Session"} start date`),
    endDate: date(session.endDate, `${session.name || "Session"} end date`),
    isYearEnd: session.isYearEnd ?? pattern.yearEndSequence === session.sequence,
  }));
  try { validateAcademicYearSessions({ yearStart: startDate, yearEnd: endDate, sessions }); }
  catch (error) { throw new AppError(error instanceof Error ? error.message : "Academic year plan is invalid.", 400, "ACADEMIC_CALENDAR_INVALID"); }
  if (input.patternKey !== "custom" && sessions.length !== pattern.labels.length) throw new AppError(`${pattern.name} requires ${pattern.labels.length} academic sessions.`, 400, "ACADEMIC_CALENDAR_INVALID");

  await advisoryLock(tx, `academic-calendar-plan:${input.schoolId}`);
  const duplicate = await tx.academicYear.findUnique({ where: { schoolId_name: { schoolId: input.schoolId, name } }, select: { id: true } });
  if (duplicate) throw new AppError("An academic year with this name already exists.", 409, "ACADEMIC_YEAR_DUPLICATE");
  const overlap = await tx.academicYear.findFirst({ where: { schoolId: input.schoolId, startDate: { lte: endDate }, endDate: { gte: startDate } }, select: { id: true, name: true } });
  if (overlap) throw new AppError(`Academic year dates overlap ${overlap.name}.`, 409, "ACADEMIC_YEAR_OVERLAP");

  const year = await tx.academicYear.create({ data: { schoolId: input.schoolId, name, startDate, endDate } });
  const planId = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "AcademicYearPlan" ("id","schoolId","academicYearId","patternKey","status","createdBy") VALUES ($1,$2,$3,$4,'active',$5)`,
    planId, input.schoolId, year.id, input.patternKey, input.actorId,
  );
  const createdTerms = [] as Array<{ id: string; name: string; startDate: Date; endDate: Date; sequence: number; isYearEnd: boolean }>;
  for (const session of [...sessions].sort((a, b) => a.sequence - b.sequence)) {
    const term = await tx.term.create({ data: { schoolId: input.schoolId, academicYearId: year.id, name: session.name, startDate: session.startDate, endDate: session.endDate } });
    await tx.$executeRawUnsafe(`UPDATE "Term" SET "teachingWeeks"=$1 WHERE "id"=$2 AND "schoolId"=$3`, session.teachingWeeks, term.id, input.schoolId);
    await syncTermWeeks(tx, { schoolId: input.schoolId, termId: term.id, startDate: session.startDate, endDate: session.endDate, teachingWeeks: session.teachingWeeks });
    const policyId = createId();
    await tx.$executeRawUnsafe(
      `INSERT INTO "AcademicSessionPolicy" ("id","schoolId","academicYearPlanId","academicYearId","termId","sequence","sessionKind","isYearEnd","closingStatus","teacherMarksCloseAt","classTeacherReviewCloseAt","reportApprovalAt","reportReleaseAt","lockTargetAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10,$11,$12,$13)`,
      policyId, input.schoolId, planId, year.id, term.id, session.sequence, pattern.sessionKind, Boolean(session.isYearEnd),
      optionalDate(session.teacherMarksCloseAt), optionalDate(session.classTeacherReviewCloseAt), optionalDate(session.reportApprovalAt), optionalDate(session.reportReleaseAt), optionalDate(session.lockTargetAt),
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "GradingPeriod" ("id","schoolId","academicYearId","termId","name","sequence","startDate","endDate","isFinal","status") VALUES ($1,$2,$3,$4,$5,1,$6::date,$7::date,true,'active')`,
      createId(), input.schoolId, year.id, term.id, `${session.name} Final`, session.startDate, session.endDate,
    );
    createdTerms.push({ id: term.id, name: term.name, startDate: term.startDate, endDate: term.endDate, sequence: session.sequence, isYearEnd: Boolean(session.isYearEnd) });
  }
  const calendar = await refreshAcademicCalendarDays(tx, { schoolId: input.schoolId, academicYearId: year.id });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "academic_year.plan_created",
    entityType: "AcademicYear",
    entityId: year.id,
    after: { name, startDate, endDate, patternKey: input.patternKey, sessions: createdTerms, instructionalDays: calendar.instructionalDays, vacations: calendar.vacations },
  });
  return { year, planId, patternKey: input.patternKey, terms: createdTerms, calendar };
}

export async function overrideSchoolCalendarDay(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  academicYearId: string;
  calendarDate: string | Date;
  dayType: SchoolCalendarDayType;
  label?: string | null;
  note?: string | null;
  isInstructional?: boolean;
  affectsAttendance?: boolean;
  affectsTransport?: boolean;
}) {
  const year = await tx.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: input.schoolId }, select: { id: true, startDate: true, endDate: true, isLocked: true } });
  if (!year) throw new AppError("Academic year not found.", 404, "ACADEMIC_YEAR_NOT_FOUND");
  if (year.isLocked) throw new AppError("A locked academic year cannot be changed.", 409, "ACADEMIC_YEAR_LOCKED");
  const calendarDate = date(input.calendarDate, "Calendar date");
  if (calendarDate < year.startDate || calendarDate > year.endDate) throw new AppError("Calendar day must sit inside the academic year.", 400, "CALENDAR_DAY_OUTSIDE_YEAR");
  const defaultInstructional = input.dayType === "instructional" || input.dayType === "makeup" || input.dayType === "exam";
  const id = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "SchoolCalendarDay" ("id","schoolId","academicYearId","calendarDate","dayType","label","isInstructional","affectsAttendance","affectsTransport","source","note","overriddenBy") VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,'manual',$10,$11)
     ON CONFLICT ("schoolId","academicYearId","calendarDate") DO UPDATE SET "dayType"=EXCLUDED."dayType","label"=EXCLUDED."label","isInstructional"=EXCLUDED."isInstructional","affectsAttendance"=EXCLUDED."affectsAttendance","affectsTransport"=EXCLUDED."affectsTransport","source"='manual',"note"=EXCLUDED."note","overriddenBy"=EXCLUDED."overriddenBy","updatedAt"=CURRENT_TIMESTAMP`,
    id, input.schoolId, input.academicYearId, calendarDate, input.dayType, input.label?.trim() || null, input.isInstructional ?? defaultInstructional,
    input.affectsAttendance ?? !defaultInstructional, input.affectsTransport ?? false, input.note?.trim() || null, input.actorId,
  );
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic_calendar.day_overridden", entityType: "SchoolCalendarDay", entityId: id, after: { academicYearId: input.academicYearId, calendarDate: dateKey(calendarDate), dayType: input.dayType, label: input.label ?? null } });
  return { ok: true };
}

export async function getTermClosingReadiness(tx: TenantDb, schoolId: string, termId: string) {
  const term = await tx.term.findFirst({ where: { id: termId, schoolId }, include: { academicYear: true } });
  if (!term) throw new AppError("Academic term not found.", 404, "TERM_NOT_FOUND");
  const policies = await tx.$queryRawUnsafe<SessionPolicyRow[]>(`SELECT "id","academicYearPlanId","academicYearId","termId","sequence","sessionKind","isYearEnd","closingStatus","teacherMarksCloseAt","classTeacherReviewCloseAt","reportApprovalAt","reportReleaseAt","lockTargetAt" FROM "AcademicSessionPolicy" WHERE "schoolId"=$1 AND "termId"=$2 LIMIT 1`, schoolId, termId);
  const policy = policies[0] ?? null;
  const [studentRows, assessments, scoreRows, reportRows, yearLearners, decisions] = await Promise.all([
    tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(DISTINCT "studentId")::bigint AS "count" FROM "Enrollment" WHERE "schoolId"=$1 AND "termId"=$2 AND "status" IN ('draft','ready','confirmed')`, schoolId, termId),
    tx.assessment.count({ where: { schoolId, termId } }),
    tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS "count" FROM "Score" s JOIN "Assessment" a ON a."id"=s."assessmentId" AND a."schoolId"=s."schoolId" WHERE s."schoolId"=$1 AND a."termId"=$2`, schoolId, termId),
    tx.$queryRawUnsafe<Array<{ generated: bigint; approved: bigint; released: bigint }>>(`SELECT COUNT(*)::bigint AS "generated",COUNT(*) FILTER (WHERE "status"='approved')::bigint AS "approved",COUNT(*) FILTER (WHERE "status"='sent')::bigint AS "released" FROM "ReportCard" WHERE "schoolId"=$1 AND "termId"=$2`, schoolId, termId),
    policy?.isYearEnd ? tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS "count" FROM "StudentYearEnrollment" WHERE "schoolId"=$1 AND "academicYearId"=$2 AND "status" IN ('active','retained')`, schoolId, term.academicYearId) : Promise.resolve([{ count: BigInt(0) }]),
    policy?.isYearEnd ? tx.$queryRawUnsafe<Array<{ confirmed: bigint; draft: bigint }>>(`SELECT COUNT(*) FILTER (WHERE "status" IN ('confirmed','applied'))::bigint AS "confirmed",COUNT(*) FILTER (WHERE "status"='draft')::bigint AS "draft" FROM "PromotionDecision" WHERE "schoolId"=$1 AND "sourceAcademicYearId"=$2`, schoolId, term.academicYearId) : Promise.resolve([{ confirmed: BigInt(0), draft: BigInt(0) }]),
  ]);
  const students = Number(studentRows[0]?.count ?? 0);
  const scores = Number(scoreRows[0]?.count ?? 0);
  const expectedScores = students * assessments;
  const reports = { generated: Number(reportRows[0]?.generated ?? 0), approved: Number(reportRows[0]?.approved ?? 0), released: Number(reportRows[0]?.released ?? 0) };
  const yearEndLearners = Number(yearLearners[0]?.count ?? 0);
  const confirmedDecisions = Number(decisions[0]?.confirmed ?? 0);
  const draftDecisions = Number(decisions[0]?.draft ?? 0);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (policy?.isYearEnd && yearEndLearners > confirmedDecisions) blockers.push(`${yearEndLearners - confirmedDecisions} learner(s) still need confirmed year-end decisions.`);
  if (expectedScores > scores) warnings.push(`${expectedScores - scores} assessment score slot(s) are not recorded. Verify absent/excused handling before close.`);
  if (students > reports.generated) warnings.push(`${students - reports.generated} learner(s) do not yet have a report card for this term.`);
  if (reports.generated > reports.approved + reports.released) warnings.push(`${reports.generated - reports.approved - reports.released} generated report card(s) are not yet approved/released.`);
  return {
    term: { id: term.id, name: term.name, academicYearId: term.academicYearId, academicYearName: term.academicYear.name, isLocked: term.isLocked },
    policy,
    students,
    assessments,
    scores,
    expectedScores,
    reports,
    yearEnd: { enabled: Boolean(policy?.isYearEnd), learners: yearEndLearners, draftDecisions, confirmedDecisions },
    blockers,
    warnings,
    ready: blockers.length === 0,
  };
}

export async function startTermClosing(tx: TenantDb, input: { schoolId: string; actorId: string; termId: string }) {
  await advisoryLock(tx, `term-closing:${input.schoolId}:${input.termId}`);
  const rows = await tx.$queryRawUnsafe<SessionPolicyRow[]>(`SELECT "id","academicYearPlanId","academicYearId","termId","sequence","sessionKind","isYearEnd","closingStatus","teacherMarksCloseAt","classTeacherReviewCloseAt","reportApprovalAt","reportReleaseAt","lockTargetAt" FROM "AcademicSessionPolicy" WHERE "schoolId"=$1 AND "termId"=$2 LIMIT 1 FOR UPDATE`, input.schoolId, input.termId);
  if (!rows[0]) throw new AppError("This term is not yet part of an academic year plan. Configure the year calendar first.", 409, "SESSION_POLICY_REQUIRED");
  if (rows[0].closingStatus === "locked") throw new AppError("This term is already locked.", 409, "TERM_LOCKED");
  await tx.$executeRawUnsafe(`UPDATE "AcademicSessionPolicy" SET "closingStatus"='closing',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "termId"=$2`, input.schoolId, input.termId);
  const readiness = await getTermClosingReadiness(tx, input.schoolId, input.termId);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic.term_closing_started", entityType: "Term", entityId: input.termId, after: { blockers: readiness.blockers, warnings: readiness.warnings } });
  return readiness;
}

export async function validateTermClosing(tx: TenantDb, input: { schoolId: string; actorId: string; termId: string }) {
  await advisoryLock(tx, `term-closing:${input.schoolId}:${input.termId}`);
  const readiness = await getTermClosingReadiness(tx, input.schoolId, input.termId);
  if (!readiness.policy) throw new AppError("This term is not part of an academic year plan.", 409, "SESSION_POLICY_REQUIRED");
  if (readiness.blockers.length) throw new AppError(readiness.blockers.join(" "), 409, "TERM_CLOSE_BLOCKED");
  await tx.$executeRawUnsafe(`UPDATE "AcademicSessionPolicy" SET "closingStatus"='ready',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "termId"=$2`, input.schoolId, input.termId);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic.term_closing_validated", entityType: "Term", entityId: input.termId, after: { warnings: readiness.warnings } });
  return { ...readiness, policy: { ...readiness.policy, closingStatus: "ready" as const } };
}

export async function lockPlannedTerm(tx: TenantDb, input: { schoolId: string; actorId: string; termId: string }) {
  await advisoryLock(tx, `term-closing:${input.schoolId}:${input.termId}`);
  const readiness = await getTermClosingReadiness(tx, input.schoolId, input.termId);
  if (!readiness.policy || readiness.policy.closingStatus !== "ready") throw new AppError("Validate term closing before locking this planned term.", 409, "TERM_CLOSE_NOT_READY");
  if (readiness.blockers.length) throw new AppError(readiness.blockers.join(" "), 409, "TERM_CLOSE_BLOCKED");
  const term = await tx.term.update({ where: { id: input.termId }, data: { isLocked: true } });
  await tx.$executeRawUnsafe(`UPDATE "AcademicSessionPolicy" SET "closingStatus"='locked',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "termId"=$2`, input.schoolId, input.termId);
  await tx.$executeRawUnsafe(`UPDATE "GradingPeriod" SET "status"='closed',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "termId"=$2`, input.schoolId, input.termId);
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic.term_locked_from_plan", entityType: "Term", entityId: input.termId, after: { isLocked: true, warningsAccepted: readiness.warnings } });
  return { term, readiness };
}
