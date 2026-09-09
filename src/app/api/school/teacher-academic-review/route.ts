import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { getTeacherReviewQueue, reviewTeacherSubmission } from "@/lib/teacher-academic-submission-service";

const schema = z.object({
  submissionId: z.string().min(1),
  reviewNotes: z.string().max(8000).optional(),
  answers: z.array(z.object({ questionId: z.string().min(1), awardedScore: z.number().finite().nonnegative().max(100000), markerComment: z.string().max(4000).optional() })).max(200),
});

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const workId = url.searchParams.get("workId");
    const submissionId = url.searchParams.get("submissionId");
    if (!workId) return NextResponse.json({ error: "workId is required" }, { status: 400 });
    return await withTenant(session.schoolId, async (tx) => {
      const queue = await getTeacherReviewQueue(tx, { schoolId: session.schoolId, teacherId: session.userId, workId });
      const questions = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT q."id",q."position",q."type",q."prompt",q."points" FROM "TeacherAcademicQuestion" q INNER JOIN "TeacherAcademicWork" w ON w."id"=q."workId" AND w."schoolId"=q."schoolId" WHERE q."schoolId"=$1 AND q."workId"=$2 ORDER BY q."position" ASC`, session.schoolId, workId);
      if (!submissionId) return NextResponse.json({ queue, questions, submission: null, answers: [] });
      const submission = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT s."id",s."studentId",st."name" AS "studentName",s."attemptNumber",s."status",s."totalAwarded",s."submittedAt",s."reviewNotes" FROM "TeacherAcademicSubmission" s INNER JOIN "Student" st ON st."id"=s."studentId" AND st."schoolId"=s."schoolId" WHERE s."id"=$1 AND s."workId"=$2 AND s."schoolId"=$3 LIMIT 1`, submissionId, workId, session.schoolId);
      if (!submission[0]) return NextResponse.json({ queue, questions, submission: null, answers: [] });
      const answers = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT a."questionId",a."responseText",a."responseData",a."awardedScore",a."markingMode",a."markerComment" FROM "TeacherAcademicAnswer" a WHERE a."schoolId"=$1 AND a."submissionId"=$2 ORDER BY a."questionId"`, session.schoolId, submissionId);
      return NextResponse.json({ queue, questions, submission: submission[0], answers });
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async (tx) => NextResponse.json(await reviewTeacherSubmission(tx, { schoolId: session.schoolId, teacherId: session.userId, ...input })));
  } catch (error) { return routeError(error); }
}
