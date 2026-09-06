import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { createAcademicYear, createCalendarEvent, createTerm } from "@/lib/calendar-service";
import { createClass, createSubject, assignSubjectTeacher } from "@/lib/setup-service";
import { registerStudent, visibleStudents } from "@/lib/sis-service";
import { hasPermission } from "@/lib/rbac";

const date = z.coerce.date();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("academicYear"), name: z.string().trim().min(1).max(80), startDate: date, endDate: date }),
  z.object({ action: z.literal("term"), academicYearId: z.string().min(1).max(100), name: z.string().trim().min(1).max(80), startDate: date, endDate: date }),
  z.object({ action: z.literal("event"), academicYearId: z.string().min(1).max(100), type: z.enum(["holiday", "vacation", "exam_week", "closure"]), name: z.string().trim().min(1).max(180), startDate: date, endDate: date, affectsAttendance: z.boolean().optional() }),
  z.object({ action: z.literal("class"), name: z.string().trim().min(1).max(120), level: z.string().trim().max(80).optional(), classTeacherId: z.string().min(1).max(100).optional() }),
  z.object({ action: z.literal("subject"), name: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("assignment"), classId: z.string().min(1).max(100), subjectId: z.string().min(1).max(100), teacherId: z.string().min(1).max(100) }),
  z.object({
    action: z.literal("student"), admissionNo: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(160),
    dob: date.optional(), classId: z.string().min(1).max(100).optional(), photoUrl: z.string().url().max(2000).optional(),
    guardian: z.object({
      name: z.string().trim().min(1).max(160), phone: z.string().trim().min(6).max(40), relationship: z.string().trim().min(1).max(60),
      isPrimary: z.boolean().optional(),
      createParentLogin: z.object({ email: z.string().trim().email().max(160).optional(), password: z.string().min(12).max(256) }).optional()
    }).optional()
  })
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      const students = await visibleStudents(tx, session.userId);
      const parentOnly =
        (await hasPermission(tx, session.userId, "parents:read_linked")) &&
        !(await hasPermission(tx, session.userId, "students:write"));
      if (parentOnly) return { students, academicYears: [], terms: [], events: [], classes: [], subjects: [], teachers: [], assignments: [] };
      const [academicYears, terms, events, classes, subjects, teachers, assignments] = await Promise.all([
        tx.academicYear.findMany({ orderBy: { startDate: "desc" } }),
        tx.term.findMany({ orderBy: { startDate: "desc" } }),
        tx.calendarEvent.findMany({ orderBy: { startDate: "desc" } }),
        tx.class.findMany({ include: { classTeacher: { select: { id: true, name: true } } }, orderBy: { name: "asc" } }),
        tx.subject.findMany({ orderBy: { name: "asc" } }),
        tx.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        tx.classSubjectTeacher.findMany({ include: { class: true, subject: true, teacher: { select: { id: true, name: true } } } })
      ]);
      return { students, academicYears, terms, events, classes, subjects, teachers, assignments };
    });
    return NextResponse.json(data);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const common = { schoolId: session.schoolId, actorId: session.userId };
    let result: unknown;
    switch (input.action) {
      case "academicYear": result = await createAcademicYear({ ...common, ...input }); break;
      case "term": result = await createTerm({ ...common, ...input }); break;
      case "event": result = await createCalendarEvent({ ...common, ...input }); break;
      case "class": result = await createClass({ ...common, ...input }); break;
      case "subject": result = await createSubject({ ...common, ...input }); break;
      case "assignment": result = await assignSubjectTeacher({ ...common, ...input }); break;
      case "student": result = await registerStudent({ ...common, ...input }); break;
    }
    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error) { return routeError(error); }
}
