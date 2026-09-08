import { appendSchoolAudit } from "./audit";
import { TenantDb, withTenant } from "./db";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { enqueueNotification } from "./message-outbox";

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

const CALENDAR_EVENT_TYPES = new Set(["holiday", "vacation", "exam_week", "closure", "academic", "parent", "operational", "sports", "trip", "meeting", "other"]);
const ATTENDANCE_BLOCKING_EVENT_TYPES = new Set(["holiday", "vacation", "closure"]);

type CalendarEventInput = {
  schoolId: string;
  actorId: string;
  academicYearId: string;
  type: string;
  name: string;
  startDate: Date;
  endDate: Date;
  affectsAttendance?: boolean;
  affectsTransport?: boolean;
  notifyGuardians?: boolean;
  notifyStaff?: boolean;
  location?: string | null;
  description?: string | null;
};

export async function createCalendarEventTx(tx: TenantDb, input: CalendarEventInput) {
  orderedDates(input.startDate, input.endDate);
  if (!CALENDAR_EVENT_TYPES.has(input.type)) throw new AppError("Invalid calendar event type.", 400, "INVALID_EVENT_TYPE");

  await requirePermission(tx, input.actorId, "calendar:manage");
  const year = await tx.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: input.schoolId }, select: { id: true, startDate: true, endDate: true } });
  if (!year) throw new AppError("The selected academic year does not belong to this school.", 400, "INVALID_ACADEMIC_YEAR");
  if (input.startDate < year.startDate || input.endDate > year.endDate) throw new AppError("Calendar event dates must fall inside the academic year.", 400, "EVENT_OUTSIDE_YEAR");

  // Attendance and transport effects are explicit. Only closure-style events
  // block attendance by default; operational communication events do not.
  const affectsAttendance = input.affectsAttendance ?? ATTENDANCE_BLOCKING_EVENT_TYPES.has(input.type);
  const affectsTransport = input.affectsTransport ?? false;
  const event = await tx.calendarEvent.create({ data: {
    schoolId: input.schoolId,
    academicYearId: year.id,
    type: input.type,
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    affectsAttendance,
    affectsTransport,
  } });

  let guardianRecipients = 0;
  let staffRecipients = 0;
  const dateText = input.startDate.toISOString().slice(0, 10) === input.endDate.toISOString().slice(0, 10)
    ? input.startDate.toISOString().slice(0, 10)
    : `${input.startDate.toISOString().slice(0, 10)} to ${input.endDate.toISOString().slice(0, 10)}`;
  const messageBody = `School calendar event: ${event.name}\nDate: ${dateText}\nType: ${event.type}`;

  if (input.notifyGuardians) {
    const guardians = await tx.guardian.findMany({
      where: { schoolId: input.schoolId, phone: { not: null } },
      select: { id: true, phone: true },
      orderBy: { id: "asc" },
    });
    for (const guardian of guardians) {
      if (!guardian.phone) continue;
      await enqueueNotification(tx, {
        schoolId: input.schoolId,
        recipientType: "guardian",
        recipientId: guardian.id,
        recipientPhone: guardian.phone,
        body: messageBody,
        templateKey: "school_announcement",
        templateVariables: { title: event.name, body: messageBody },
        idempotencyKey: `calendar-event:${event.id}:guardian:${guardian.id}`,
      });
      guardianRecipients++;
    }
  }

  if (input.notifyStaff) {
    const staff = await tx.user.findMany({
      where: { schoolId: input.schoolId, status: "active", phone: { not: null }, guardianProfiles: { none: { schoolId: input.schoolId } } },
      select: { id: true, phone: true },
      orderBy: { id: "asc" },
    });
    for (const user of staff) {
      if (!user.phone) continue;
      await enqueueNotification(tx, {
        schoolId: input.schoolId,
        recipientType: "staff",
        recipientId: user.id,
        recipientPhone: user.phone,
        body: messageBody,
        templateKey: "school_announcement",
        templateVariables: { title: event.name, body: messageBody },
        idempotencyKey: `calendar-event:${event.id}:staff:${user.id}`,
      });
      staffRecipients++;
    }
  }

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "calendar_event.created",
    entityType: "CalendarEvent",
    entityId: event.id,
    after: {
      ...event,
      location: input.location || null,
      description: input.description || null,
      notifyGuardians: Boolean(input.notifyGuardians),
      notifyStaff: Boolean(input.notifyStaff),
      guardianRecipients,
      staffRecipients,
    },
  });

  return { event, guardianRecipients, staffRecipients };
}

export async function createCalendarEvent(input: CalendarEventInput) {
  return withTenant(input.schoolId, async (tx) => {
    const result = await createCalendarEventTx(tx, input);
    return result.event;
  });
}
