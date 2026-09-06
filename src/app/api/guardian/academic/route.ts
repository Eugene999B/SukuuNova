import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { getGuardianAcademicOverview, saveGuardianSubmission, startGuardianSubmission, submitGuardianSubmission } from "@/lib/teacher-academic-submission-service";

const answerSchema = z.object({ questionId: z.string().min(1), responseText: z.string().max(20000).optional(), responseData: z.unknown().optional() });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), studentId: z.string().min(1), workId: z.string().min(1) }),
  z.object({ action: z.literal("save"), studentId: z.string().min(1), workId: z.string().min(1), answers: z.array(answerSchema).max(200) }),
  z.object({ action: z.literal("submit"), studentId: z.string().min(1), workId: z.string().min(1) }),
]);

export async function GET(request: Request) {
  try {
    const session = await requireGuardianSession();
    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId") ?? undefined;
    const subjectId = url.searchParams.get("subjectId") ?? undefined;
    return await withTenant(session.schoolId, async (tx) => NextResponse.json(await getGuardianAcademicOverview(tx, { schoolId: session.schoolId, guardianId: session.guardianId, studentId, subjectId })));
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireGuardianSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async (tx) => {
      if (input.action === "start") return NextResponse.json(await startGuardianSubmission(tx, { schoolId: session.schoolId, guardianId: session.guardianId, studentId: input.studentId, workId: input.workId }));
      if (input.action === "save") return NextResponse.json(await saveGuardianSubmission(tx, { schoolId: session.schoolId, guardianId: session.guardianId, studentId: input.studentId, workId: input.workId, answers: input.answers }));
      return NextResponse.json(await submitGuardianSubmission(tx, { schoolId: session.schoolId, guardianId: session.guardianId, studentId: input.studentId, workId: input.workId }));
    });
  } catch (error) { return routeError(error); }
}
