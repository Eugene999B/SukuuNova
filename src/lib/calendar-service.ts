import { appendSchoolAudit } from "./audit";
import { withTenant } from "./db";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";

function orderedDates(startDate: Date, endDate: Date) {
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) {
    throw new AppError("End date must be on or after start date.", 400, "INVALID_DATE_RANGE");
  }
}

export async function createAcademicYear(input: {
  schoolId: string; actorId: string; name: string; startDate: Date; endDate: Date;
}) {
  orderedDates(input.startDate, input.endDate);
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "calendar:manage");
    const year = await tx.academicYear.create({ data: {
      schoolId: input.schoolId, name: input.name.trim(),
      startDate: input.startDate, endDate: input.endDate
    }});
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId,
      action: "academic_year.created", entityType: "AcademicYear", entityId: year.id, after: year });
    return year;
  });
}

export async function createTerm(input: {
  schoolId: string; actorId: string; academicYearId: string; name: string;
  startDate: Date; endDate: Date;
}) {
  orderedDates(input.startDate, input.endDate);
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "calendar:manage");
    const year = await tx.academicYear.findUniqueOrThrow({ where: { id: input.academicYearId } });
    if (input.startDate < year.startDate || input.endDate > year.endDate) {
      throw new AppError("Term dates must fall inside the academic year.", 400, "TERM_OUTSIDE_YEAR");
    }
    const term = await tx.term.create({ data: {
      schoolId: input.schoolId, academicYearId: year.id, name: input.name.trim(),
      startDate: input.startDate, endDate: input.endDate
    }});
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId,
      action: "term.created", entityType: "Term", entityId: term.id, after: term });
    return term;
  });
}

export async function createCalendarEvent(input: {
  schoolId: string; actorId: string; academicYearId: string; type: string;
  name: string; startDate: Date; endDate: Date; affectsAttendance?: boolean;
}) {
  orderedDates(input.startDate, input.endDate);
  const allowed = new Set(["holiday", "vacation", "exam_week", "closure", "academic", "parent", "operational", "sports", "trip", "meeting", "other"]);
  if (!allowed.has(input.type)) throw new AppError("Invalid calendar event type.", 400, "INVALID_EVENT_TYPE");
  return withTenant(input.schoolId, async (tx) => {
    await requirePermission(tx, input.actorId, "calendar:manage");
    const event = await tx.calendarEvent.create({ data: {
      schoolId: input.schoolId, academicYearId: input.academicYearId,
      type: input.type, name: input.name.trim(), startDate: input.startDate,
      endDate: input.endDate, affectsAttendance: input.affectsAttendance ?? true
    }});
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId,
      action: "calendar_event.created", entityType: "CalendarEvent", entityId: event.id, after: event });
    return event;
  });
}
