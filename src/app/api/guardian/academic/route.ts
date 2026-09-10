import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { guardianAcademicContextStudentId } from "@/lib/guardian-family-context";
import { requireAcademicWorkWindowOpen } from "@/lib/academic-work-window";
import { finalizeGuardianSubmission, getGuardianAcademicOverview, retryGuardianSubmission, saveGuardianSubmission, startGuardianSubmission, submitGuardianSubmission } from "@/lib/teacher-academic-submission-service";

const answerSchema = z.object({ questionId: z.string().min(1), responseText: z.string().max(20000).optional(), responseData: z.unknown().optional() });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), studentId: z.string().min(1), workId: z.string().min(1), attemptNumber: z.number().int().min(1).max(10).optional() }),
  z.object({ action: z.literal("retry"), studentId: z.string().min(1), workId: z.string().min(1) }),
  z.object({ action: z.literal("save"), studentId: z.string().min(1), workId: z.string().min(1), answers: z.array(answerSchema).max(200) }),
  z.object({ action: z.literal("submit"), studentId: z.string().min(1), workId: z.string().min(1), answers: z.array(answerSchema).max(200).optional() }),
]);

export async function GET(request: Request) {
  try {
    const session = await requireGuardianSession();
    const url = new URL(request.url);
    // The referer fallback is only an initial UI-context hint. getGuardianAcademicOverview still verifies
    // that the requested learner is linked to this guardian before returning any learner data.
    const studentId = guardianAcademicContextStudentId(request);
    const subjectId = url.searchParams.get("subjectId") ?? undefined;
    return await withTenant(session.schoolId, async (tx) => NextResponse.json(await getGuardianAcademicOverview(tx, { schoolId: session.schoolId, guardianId: session.guardianId, studentId, subjectId }), { headers: { "Cache-Control": "no-store" } }));
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireGuardianSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async (tx) => {
      // The configured opening/closing window is authoritative for every learner mutation,
      // not just the first Start click. This prevents early starts, late autosaves and
      // submissions sneaking through after a page has been left open in the browser.
      await requireAcademicWorkWindowOpen(tx, session.schoolId, input.workId);
      const common = { schoolId: session.schoolId, guardianId: session.guardianId, studentId: input.studentId, workId: input.workId };
      if (input.action === "start") {
        const result = await startGuardianSubmission(tx, { ...common, attemptNumber: input.attemptNumber });
        if (result.canRetry) {
          const term = await tx.term.findFirst({ where: { id: result.work.termId, schoolId: session.schoolId }, select: { isLocked: true } });
          if (term?.isLocked) result.canRetry = false;
        }
        return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
      }
      if (input.action === "retry") return NextResponse.json(await retryGuardianSubmission(tx, common), { headers: { "Cache-Control": "no-store" } });
      if (input.action === "save") return NextResponse.json(await saveGuardianSubmission(tx, { ...common, answers: input.answers }), { headers: { "Cache-Control": "no-store" } });
      if (input.answers) return NextResponse.json(await finalizeGuardianSubmission(tx, { ...common, answers: input.answers }), { headers: { "Cache-Control": "no-store" } });
      return NextResponse.json(await submitGuardianSubmission(tx, common), { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) { return routeError(error); }
}
