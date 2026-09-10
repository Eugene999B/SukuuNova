import { NextResponse } from "next/server";
import { z } from "zod";
import { appendSchoolAudit } from "@/lib/audit";
import { getSchoolAuthorization } from "@/lib/authorization";
import { isAttendanceBlocked } from "@/lib/attendance-service";
import { withTenant, type TenantDb } from "@/lib/db";
import { AppError, ForbiddenError, routeError } from "@/lib/errors";
import { requireSchoolSession } from "@/lib/school-auth";
import { schoolLocalDateKey } from "@/lib/term-date";

const saveSchema = z.object({
  classId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(z.object({ studentId: z.string().trim().min(1), status: z.enum(["present", "absent"]) })).min(1).max(500),
});

function parseSchoolDays(value: unknown): number[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [1, 2, 3, 4, 5];
  const raw = (value as Record<string, unknown>).schoolDays;
  if (!Array.isArray(raw)) return [1, 2, 3, 4, 5];
  const days = raw.filter((item): item is number => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 6);
  return days.length ? [...new Set(days)] : [1, 2, 3, 4, 5];
}

function dateValue(key: string) {
  const value = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== key) throw new AppError("Choose a valid attendance date.", 400, "INVALID_ATTENDANCE_DATE");
  return value;
}

async function teacherClasses(tx: TenantDb, schoolId: string, teacherId: string, canRecordAll: boolean) {
  return tx.class.findMany({
    where: { schoolId, ...(canRecordAll ? {} : { classTeacherId: teacherId }) },
    select: { id: true, name: true, level: true, _count: { select: { students: true } } },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
}

async function commonContext(tx: TenantDb, schoolId: string, userId: string) {
  const access = await getSchoolAuthorization(tx, userId);
  if (access.workspace !== "teacher" || !access.isTeacher) throw new ForbiddenError("Teacher attendance is not available for this account.");
  const [canAssigned, canAll, settings] = await Promise.all([
    access.can("attendance:record_assigned"),
    access.can("attendance:record_all"),
    tx.schoolSettings.findUnique({ where: { schoolId }, select: { timezone: true, timetableConfig: true } }),
  ]);
  if (!canAssigned && !canAll) throw new ForbiddenError("You are not permitted to record learner attendance.");
  return {
    access,
    canAll,
    timezone: settings?.timezone || "Africa/Accra",
    schoolDays: parseSchoolDays(settings?.timetableConfig),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    return await withTenant(session.schoolId, async (tx) => {
      const context = await commonContext(tx, session.schoolId, session.userId);
      const requestedDate = url.searchParams.get("date") || schoolLocalDateKey(new Date(), context.timezone);
      const day = dateValue(requestedDate);
      const classes = await teacherClasses(tx, session.schoolId, session.userId, context.canAll);
      const requestedClassId = url.searchParams.get("classId") || classes[0]?.id || "";
      if (requestedClassId && !classes.some((item) => item.id === requestedClassId)) throw new ForbiddenError("That class is outside your attendance scope.");
      const weekday = day.getUTCDay();
      const schoolDay = context.schoolDays.includes(weekday);
      const calendarBlocked = requestedClassId ? await isAttendanceBlocked(tx, session.schoolId, day) : false;
      const students = requestedClassId ? await tx.student.findMany({
        where: { schoolId: session.schoolId, classId: requestedClassId, status: "active" },
        select: { id: true, name: true, admissionNo: true, photoUrl: true },
        orderBy: { name: "asc" },
      }) : [];
      const studentIds = students.map((student) => student.id);
      const events = studentIds.length ? await tx.attendanceEvent.findMany({
        where: { schoolId: session.schoolId, attendanceDate: day, studentId: { in: studentIds }, type: { in: ["in", "absent", "absence"] } },
        select: { id: true, studentId: true, type: true, method: true, periodId: true, timestamp: true, recordedBy: true, isLate: true },
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      }) : [];
      const rows = students.map((student) => {
        const own = events.filter((event) => event.studentId === student.id);
        const automatedPresent = own.find((event) => event.type === "in" && event.method !== "manual");
        const register = own.find((event) => event.method === "manual" && event.periodId === "DAILY_REGISTER");
        const otherPresent = own.find((event) => event.type === "in");
        const source = automatedPresent ? "device" : register ? "teacher" : otherPresent ? "manual" : "unmarked";
        const status = automatedPresent || otherPresent && !register ? "present" : register?.type === "in" ? "present" : register && ["absent", "absence"].includes(register.type) ? "absent" : null;
        return { ...student, status, source, lockedPresent: Boolean(automatedPresent), isLate: Boolean((automatedPresent || register || otherPresent)?.isLate) };
      });
      return NextResponse.json({ classes, classId: requestedClassId, date: requestedDate, timezone: context.timezone, schoolDays: context.schoolDays, schoolDay, calendarBlocked, rows });
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = saveSchema.parse(await request.json());
    return await withTenant(session.schoolId, async (tx) => {
      const context = await commonContext(tx, session.schoolId, session.userId);
      const day = dateValue(input.date);
      if (!context.schoolDays.includes(day.getUTCDay())) throw new AppError("This date is not configured as a school day.", 409, "NOT_A_SCHOOL_DAY");
      if (await isAttendanceBlocked(tx, session.schoolId, day)) throw new AppError("Attendance is closed for this holiday or school-calendar date.", 409, "CALENDAR_BLOCKS_ATTENDANCE");
      const classes = await teacherClasses(tx, session.schoolId, session.userId, context.canAll);
      if (!classes.some((item) => item.id === input.classId)) throw new ForbiddenError("That class is outside your attendance scope.");
      const students = await tx.student.findMany({ where: { schoolId: session.schoolId, classId: input.classId, status: "active" }, select: { id: true } });
      const roster = new Set(students.map((student) => student.id));
      const supplied = new Set(input.entries.map((entry) => entry.studentId));
      if (supplied.size !== input.entries.length || input.entries.some((entry) => !roster.has(entry.studentId))) throw new ForbiddenError("The register contains a learner outside this class.");
      if (supplied.size !== roster.size) throw new AppError("Complete the full class register before saving.", 400, "INCOMPLETE_REGISTER");

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`teacher-register:${session.schoolId}:${input.classId}:${input.date}`}))`;
      const automated = await tx.attendanceEvent.findMany({
        where: { schoolId: session.schoolId, attendanceDate: day, studentId: { in: [...roster] }, type: "in", method: { not: "manual" } },
        select: { studentId: true },
      });
      const automaticallyPresent = new Set(automated.map((event) => event.studentId).filter((id): id is string => Boolean(id)));
      const invalidAbsence = input.entries.find((entry) => entry.status === "absent" && automaticallyPresent.has(entry.studentId));
      if (invalidAbsence) throw new AppError("A learner with verified device attendance cannot be marked absent. Refresh the register to see the verified status.", 409, "VERIFIED_ATTENDANCE_CONFLICT");

      const before = await tx.attendanceEvent.findMany({
        where: { schoolId: session.schoolId, attendanceDate: day, studentId: { in: [...roster] }, method: "manual", periodId: "DAILY_REGISTER" },
        select: { id: true, studentId: true, type: true, timestamp: true, recordedBy: true },
      });
      await tx.attendanceEvent.deleteMany({ where: { schoolId: session.schoolId, attendanceDate: day, studentId: { in: [...roster] }, method: "manual", periodId: "DAILY_REGISTER" } });
      const now = new Date();
      const createRows = input.entries.filter((entry) => !automaticallyPresent.has(entry.studentId)).map((entry) => ({
        schoolId: session.schoolId,
        studentId: entry.studentId,
        type: entry.status === "present" ? "in" : "absent",
        method: "manual",
        timestamp: now,
        attendanceDate: day,
        isLate: entry.status === "present" ? false : null,
        recordedBy: session.userId,
        periodId: "DAILY_REGISTER",
      }));
      if (createRows.length) await tx.attendanceEvent.createMany({ data: createRows });
      const present = input.entries.filter((entry) => entry.status === "present").length;
      const absent = input.entries.length - present;
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "attendance.teacher_register_saved",
        entityType: "Class",
        entityId: input.classId,
        before: { registerEvents: before },
        after: { date: input.date, present, absent, verifiedPresent: automaticallyPresent.size, total: input.entries.length },
      });
      return NextResponse.json({ ok: true, message: `Register saved: ${present} present, ${absent} absent.`, present, absent, verifiedPresent: automaticallyPresent.size });
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "INVALID_REGISTER", message: "Complete the class register before saving." }, { status: 400 });
    return routeError(error);
  }
}
