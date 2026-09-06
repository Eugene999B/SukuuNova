import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { createTeacherAcademicNote, createTeacherAcademicWork, getTeacherAcademicContexts, getTeacherAcademicRoster, publishTeacherAcademicNote, publishTeacherAcademicWork, saveTeacherWorkMarks } from "@/lib/teacher-academic-workspace-service";

const questionSchema = z.object({ type: z.string().trim().min(1).max(40), prompt: z.string().trim().min(1).max(4000), points: z.number().finite().positive().max(1000), options: z.array(z.string().trim().max(500)).max(20).optional(), acceptedAnswers: z.array(z.string().trim().max(500)).max(20).optional() });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createWork"), termId: z.string().min(1), classId: z.string().min(1), subjectId: z.string().min(1), kind: z.enum(["Classwork","Homework","Exercise","Participation","Quiz","Exam"]), title: z.string().trim().min(1).max(160), instructions: z.string().max(8000).optional(), workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), weekNumber: z.number().int().min(1).max(60), workNumber: z.number().int().min(1).max(50), maxScore: z.number().finite().positive().max(100000), markingMode: z.enum(["manual","auto","review"]), dueAt: z.string().datetime().nullable().optional(), answerGuide: z.unknown().optional(), questionList: z.array(questionSchema).max(100).optional() }),
  z.object({ action: z.literal("publishWork"), workId: z.string().min(1) }),
  z.object({ action: z.literal("saveMarks"), workId: z.string().min(1), marks: z.array(z.object({ studentId: z.string().min(1), value: z.number().finite().nonnegative().max(100000), status: z.enum(["present","absent","excused"]).optional() })).max(5000) }),
  z.object({ action: z.literal("createNote"), termId: z.string().min(1), classId: z.string().min(1), subjectId: z.string().min(1), title: z.string().trim().min(1).max(160), content: z.unknown(), weekNumber: z.number().int().min(1).max(60).optional() }),
  z.object({ action: z.literal("publishNote"), noteId: z.string().min(1) }),
]);

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const classId = url.searchParams.get("classId");
    const subjectId = url.searchParams.get("subjectId");
    const termId = url.searchParams.get("termId");
    return await withTenant(session.schoolId, async tx => {
      if (!classId || !subjectId || !termId) return NextResponse.json(await getTeacherAcademicContexts(tx, session.schoolId, session.userId));
      return NextResponse.json(await getTeacherAcademicRoster(tx, { schoolId: session.schoolId, teacherId: session.userId, classId, subjectId, termId }));
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async tx => {
      const common = { schoolId: session.schoolId, teacherId: session.userId };
      if (input.action === "createWork") return NextResponse.json({ ok: true, result: await createTeacherAcademicWork(tx, { ...common, ...input }) });
      if (input.action === "publishWork") return NextResponse.json({ ok: true, result: await publishTeacherAcademicWork(tx, { ...common, workId: input.workId }) });
      if (input.action === "saveMarks") return NextResponse.json({ ok: true, result: await saveTeacherWorkMarks(tx, { ...common, workId: input.workId, marks: input.marks }) });
      if (input.action === "createNote") return NextResponse.json({ ok: true, result: await createTeacherAcademicNote(tx, { ...common, ...input }) });
      return NextResponse.json({ ok: true, result: await publishTeacherAcademicNote(tx, { ...common, noteId: input.noteId }) });
    });
  } catch (error) { return routeError(error); }
}
