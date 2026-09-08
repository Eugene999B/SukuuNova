import { appendSchoolAudit } from "./audit";
import { withTenant } from "./db";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";

function orderedDates(startDate: Date, endDate: Date) {
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) {
    throw new AppError("End date must be on or after start date.", 400, "INVALID_DATE_RANGE");
  }
}

export async function createAcademicYear(input: { schoolId: string; actorId: string; name: string; startDate: Date; endDate: Date; }) {
  orderedDates(input.startDate, input.endDate);
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "calendar:manage");
    const year = await tx.academicYear.create({ data: { schoolId: input.schoolId, name: input.name.trim(), startDate: input.startDate, endDate: input.endDate } });
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "academic_year.created", entityType: "AcademicYear", entityId: year.id, after: year });
    return year;
  });
}

export async function createTerm(input: { schoolId: string; actorId: string; academicYearId: string; name: string; startDate: Date; endDate: Date; }) {
  orderedDates(input.startDate, input.endDate);
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "calendar:manage");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academic-year-terms:${input.schoolId}:${input.academicYearId}`}))`;
    const year = await tx.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: input.schoolId }, select: { id: true, startDate: true, endDate: true } });
    if (!year) throw new AppError("The selected academic year does not belong to this school.", 400, "INVALID_ACADEMIC_YEAR");
    if (input.startDate < year.startDate || input.endDate > year.endDate) throw new AppError("Term dates must fall inside the academic year.", 400, "TERM_OUTSIDE_YEAR");
    const overlap = await tx.term.findFirst({ where: { schoolId: input.schoolId, academicYearId: input.academicYearId, startDate: { lt: input.endDate }, endDate: { gt: input.startDate } }, select: { name: true } });
    if (overlap) throw new AppError(`Term dates overlap ${overlap.name}.`, 409, "TERM_OVERLAP");
    const term = await tx.term.create({ data: { schoolId: input.schoolId, academicYearId: year.id, name: input.name.trim(), startDate: input.startDate, endDate: input.endDate } });
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "term.created", entityType: "Term", entityId: term.id, after: term });
    return term;
  });
}

export async function createCalendarEvent(input: { schoolId: string; actorId: string; academicYearId: string; type: string; name: string; startDate: Date; endDate: Date; affectsAttendance?: boolean; affectsTransport?: boolean; }) {
  orderedDates(input.startDate, input.endDate);
  const allowed = new Set(["holiday", "vacation", "exam_week", "closure", "academic", "parent", "operational", "sports", "trip", "meeting", "other"]);
  if (!allowed.has(input.type)) throw new AppError("Invalid calendar event type.", 400, "INVALID_EVENT_TYPE");
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "calendar:manage");
    const year = await tx.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: input.schoolId }, select: { id: true, startDate: true, endDate: true } });
    if (!year) throw new AppError("The selected academic year does not belong to this school.", 400, "INVALID_ACADEMIC_YEAR");
    if (input.startDate < year.startDate || input.endDate > year.endDate) throw new AppError("Calendar event dates must fall inside the academic year.", 400, "EVENT_OUTSIDE_YEAR");
    // Only school-closure style events should block attendance by default.
    // Operational meetings, trips, sports, parent events and exam weeks remain
    // attendance-recording days unless the caller explicitly says otherwise.
    const defaultAffectsAttendance = new Set(["holiday", "vacation", "closure"]).has(input.type);
    const event = await tx.calendarEvent.create({ data: { schoolId: input.schoolId, academicYearId: year.id, type: input.type, name: input.name.trim(), startDate: input.startDate, endDate: input.endDate, affectsAttendance: input.affectsAttendance ?? defaultAffectsAttendance, affectsTransport: input.affectsTransport ?? false } });
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "calendar_event.created", entityType: "CalendarEvent", entityId: event.id, after: event });
    return event;
  });
}
