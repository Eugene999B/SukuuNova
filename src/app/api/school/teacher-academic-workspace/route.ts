import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant, type TenantDb } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { termLifecycle, selectAcademicTerm } from "@/lib/term-date";
import { createTeacherAcademicNote, createTeacherAcademicWork, getTeacherAcademicContexts, getTeacherAcademicRoster, publishTeacherAcademicNote, publishTeacherAcademicWork, saveTeacherWorkMarks } from "@/lib/teacher-academic-workspace-service";

const questionSchema = z.object({ type: z.string().trim().min(1).max(40), prompt: z.string().trim().min(1).max(4000), points: z.number().finite().positive().max(1000), options: z.array(z.string().trim().max(500)).max(20).optional(), acceptedAnswers: z.array(z.string().trim().max(500)).max(20).optional() });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createWork"), termId: z.string().min(1), classId: z.string().min(1), subjectId: z.string().min(1), kind: z.enum(["Classwork","Homework","Exercise","Participation","Quiz","Exam"]), title: z.string().trim().min(1).max(160), instructions: z.string().max(8000).optional(), workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), weekNumber: z.number().int().min(1).max(60), workNumber: z.number().int().min(1).max(50), maxScore: z.number().finite().positive().max(100000), markingMode: z.enum(["manual","auto","review"]), attemptLimit: z.number().int().min(1).max(10).default(1), attemptScorePolicy: z.enum(["highest","latest"]).default("highest"), opensAt: z.string().datetime().nullable().optional(), dueAt: z.string().datetime().nullable().optional(), answerGuide: z.unknown().optional(), questionList: z.array(questionSchema).max(100).optional() }),
  z.object({ action: z.literal("publishWork"), workId: z.string().min(1) }),
  z.object({ action: z.literal("saveMarks"), workId: z.string().min(1), marks: z.array(z.object({ studentId: z.string().min(1), value: z.number().finite().nonnegative().max(100000), status: z.enum(["present","absent","excused"]).optional(), expected: z.object({ id: z.string().min(1), value: z.number().finite(), status: z.enum(["present","absent","excused"]), enteredAt: z.string().datetime() }).nullable() })).max(5000) }),
  z.object({ action: z.literal("createNote"), termId: z.string().min(1), classId: z.string().min(1), subjectId: z.string().min(1), title: z.string().trim().min(1).max(160), content: z.unknown(), weekNumber: z.number().int().min(1).max(60).optional() }),
  z.object({ action: z.literal("publishNote"), noteId: z.string().min(1) }),
]);

async function timezone(tx: TenantDb, schoolId: string) {
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId }, select: { timezone: true } });
  return settings?.timezone || "Africa/Accra";
}

async function authoritativeTerm(tx: TenantDb, schoolId: string) {
  const [terms, zone] = await Promise.all([
    tx.term.findMany({ where: { schoolId }, select: { id: true, name: true, startDate: true, endDate: true, isLocked: true }, orderBy: { startDate: "desc" } }),
    timezone(tx, schoolId),
  ]);
  const active = selectAcademicTerm(terms, undefined, new Date(), zone);
  return { active, terms, zone };
}

async function assertWritableTerm(tx: TenantDb, schoolId: string, termId: string) {
  const { active, terms, zone } = await authoritativeTerm(tx, schoolId);
  const term = terms.find(item => item.id === termId);
  if (!term) throw new AppError("The academic term is not available.", 404, "TERM_NOT_FOUND");
  const lifecycle = termLifecycle(term, new Date(), zone);
  if (lifecycle.state === "locked") throw new AppError(`Term "${term.name}" is locked.`, 409, "TERM_LOCKED");
  if (lifecycle.state === "upcoming") throw new AppError(`Term "${term.name}" has not started yet.`, 409, "TERM_NOT_STARTED");
  if (lifecycle.state === "ended") throw new AppError(`Term "${term.name}" has ended. School leadership must finalize and lock the term; teachers can no longer change academic records in it.`, 409, "TERM_ENDED");
  if (!active || active.id !== term.id) throw new AppError("This is not the school's current working term.", 409, "TERM_NOT_ACTIVE");
  return term;
}

async function workTermId(tx: TenantDb, schoolId: string, workId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ termId: string }>>(`SELECT "termId" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, schoolId, workId);
  return rows[0]?.termId ?? null;
}

async function noteTermId(tx: TenantDb, schoolId: string, noteId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ termId: string }>>(`SELECT "termId" FROM "TeacherAcademicNote" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, schoolId, noteId);
  return rows[0]?.termId ?? null;
}

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const classId = url.searchParams.get("classId");
    const subjectId = url.searchParams.get("subjectId");
    const termId = url.searchParams.get("termId");
    return await withTenant(session.schoolId, async tx => {
      if (!classId || !subjectId || !termId) {
        const [contexts, authority] = await Promise.all([getTeacherAcademicContexts(tx, session.schoolId, session.userId), authoritativeTerm(tx, session.schoolId)]);
        const activeTerm = authority.active;
        return NextResponse.json({
          ...contexts,
          terms: activeTerm ? [activeTerm] : [],
          activeTermId: activeTerm?.id ?? null,
          activeTerm: activeTerm ? { ...activeTerm, lifecycle: termLifecycle(activeTerm, new Date(), authority.zone) } : null,
          timezone: authority.zone,
          archivedTermCount: contexts.terms.filter(term => term.id !== activeTerm?.id).length,
        });
      }
      const term = await assertWritableTerm(tx, session.schoolId, termId);
      return NextResponse.json({ ...(await getTeacherAcademicRoster(tx, { schoolId: session.schoolId, teacherId: session.userId, classId, subjectId, termId })), term: { ...term, lifecycle: termLifecycle(term, new Date(), await timezone(tx, session.schoolId)) } });
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async tx => {
      const common = { schoolId: session.schoolId, teacherId: session.userId };
      if (input.action === "createWork") {
        await assertWritableTerm(tx, session.schoolId, input.termId);
        if (input.opensAt && input.dueAt && Date.parse(input.opensAt) >= Date.parse(input.dueAt)) throw new AppError("The closing time must be later than the opening time.", 400, "INVALID_WORK_WINDOW");
        const result = await createTeacherAcademicWork(tx, { ...common, ...input });
        if (input.opensAt) await tx.$executeRawUnsafe(`UPDATE "TeacherAcademicWork" SET "opensAt"=$3::timestamptz,"updatedAt"=NOW() WHERE "schoolId"=$1 AND "id"=$2`, session.schoolId, result.id, input.opensAt);
        return NextResponse.json({ ok: true, result });
      }
      if (input.action === "publishWork") {
        const termId = await workTermId(tx, session.schoolId, input.workId);
        if (!termId) throw new AppError("Work not found.", 404, "NOT_FOUND");
        await assertWritableTerm(tx, session.schoolId, termId);
        return NextResponse.json({ ok: true, result: await publishTeacherAcademicWork(tx, { ...common, workId: input.workId }) });
      }
      if (input.action === "saveMarks") {
        const termId = await workTermId(tx, session.schoolId, input.workId);
        if (!termId) throw new AppError("Work not found.", 404, "NOT_FOUND");
        await assertWritableTerm(tx, session.schoolId, termId);
        return NextResponse.json({ ok: true, result: await saveTeacherWorkMarks(tx, { ...common, workId: input.workId, marks: input.marks }) });
      }
      if (input.action === "createNote") {
        await assertWritableTerm(tx, session.schoolId, input.termId);
        return NextResponse.json({ ok: true, result: await createTeacherAcademicNote(tx, { ...common, ...input }) });
      }
      const termId = await noteTermId(tx, session.schoolId, input.noteId);
      if (!termId) throw new AppError("Note not found.", 404, "NOT_FOUND");
      await assertWritableTerm(tx, session.schoolId, termId);
      return NextResponse.json({ ok: true, result: await publishTeacherAcademicNote(tx, { ...common, noteId: input.noteId }) });
    });
  } catch (error) { return routeError(error); }
}
