import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendSchoolAudit } from "@/lib/audit";
import { withTenant } from "@/lib/db";
import { AppError, ForbiddenError, routeError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";

const reasonSchema = z.enum(["curriculum_alignment", "learning_outcomes", "assessment", "differentiation", "resources", "clarity", "timing", "other"]);
const reviewSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["approved", "changes_requested"]),
  reasonCode: reasonSchema.optional(),
  note: z.string().trim().max(3000).optional(),
});

type PlanRow = {
  id: string; teacherId: string; teacherName: string; classId: string; className: string; classLevel: string | null; subjectId: string; subjectName: string;
  termId: string | null; termName: string | null; academicYearName: string | null; termLocked: boolean | null; title: string; plannedDate: Date; status: string;
  objective: string | null; content: string; topic: string | null; subTopic: string | null; curriculumObjective: string | null; learningOutcomes: string | null;
  priorKnowledge: string | null; materials: string | null; introduction: string | null; development: string | null; differentiatedActivities: string | null;
  assessment: string | null; conclusion: string | null; homework: string | null; reflection: string | null; resources: unknown; documentContent: unknown;
  reviewNote: string | null; reviewerName: string | null; submittedAt: Date | null; reviewedAt: Date | null; completedAt: Date | null; updatedAt: Date;
};
type ReviewRow = { id: string; lessonPlanId: string; reviewerName: string; decision: string; reasonCode: string | null; note: string | null; createdAt: Date };

const lockKey = (schoolId: string, id: string) => `lesson-review-v2:${schoolId}:${id}`;

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return NextResponse.json(await withTenant(session.schoolId, async (tx) => {
      if (!(await hasPermission(tx, session.userId, "lesson_plans:review"))) throw new ForbiddenError("Academic lesson verification is not available for this account.");
      const rows = await tx.$queryRaw<PlanRow[]>`
        SELECT lp."id",lp."teacherId",u."name" AS "teacherName",lp."classId",c."name" AS "className",c."level" AS "classLevel",lp."subjectId",s."name" AS "subjectName",
          lp."termId",t."name" AS "termName",ay."name" AS "academicYearName",t."isLocked" AS "termLocked",lp."title",lp."plannedDate",lp."status",lp."objective",lp."content",
          lp."topic",lp."subTopic",lp."curriculumObjective",lp."learningOutcomes",lp."priorKnowledge",lp."materials",lp."introduction",lp."development",lp."differentiatedActivities",
          lp."assessment",lp."conclusion",lp."homework",lp."reflection",lp."resources",lp."documentContent",lp."reviewNote",reviewer."name" AS "reviewerName",lp."submittedAt",lp."reviewedAt",lp."completedAt",lp."updatedAt"
        FROM "LessonPlan" lp
        JOIN "User" u ON u."id"=lp."teacherId" AND u."schoolId"=lp."schoolId"
        JOIN "Class" c ON c."id"=lp."classId" AND c."schoolId"=lp."schoolId"
        JOIN "Subject" s ON s."id"=lp."subjectId" AND s."schoolId"=lp."schoolId"
        LEFT JOIN "Term" t ON t."id"=lp."termId" AND t."schoolId"=lp."schoolId"
        LEFT JOIN "AcademicYear" ay ON ay."id"=t."academicYearId" AND ay."schoolId"=lp."schoolId"
        LEFT JOIN "User" reviewer ON reviewer."id"=lp."reviewerId" AND reviewer."schoolId"=lp."schoolId"
        WHERE lp."schoolId"=${session.schoolId}
        ORDER BY CASE lp."status" WHEN 'submitted' THEN 0 WHEN 'changes_requested' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, lp."plannedDate" DESC, lp."updatedAt" DESC
        LIMIT 600`;
      const planIds = rows.map((row) => row.id);
      const reviews = planIds.length ? await tx.$queryRaw<ReviewRow[]>`
        SELECT r."id",r."lessonPlanId",u."name" AS "reviewerName",r."decision",r."reasonCode",r."note",r."createdAt"
        FROM "LessonPlanReview" r
        JOIN "User" u ON u."id"=r."reviewerId" AND u."schoolId"=r."schoolId"
        WHERE r."schoolId"=${session.schoolId} AND r."lessonPlanId" IN (${Prisma.join(planIds)})
        ORDER BY r."createdAt" DESC LIMIT 2500` : [];
      return { rows, reviews, me: session.userId };
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = reviewSchema.parse(await request.json());
    return NextResponse.json(await withTenant(session.schoolId, async (tx) => {
      if (!(await hasPermission(tx, session.userId, "lesson_plans:review"))) throw new ForbiddenError("Academic lesson verification is not available for this account.");
      if (input.decision === "changes_requested" && !input.reasonCode) throw new AppError("Choose the area the teacher should revise.", 400, "REVIEW_REASON_REQUIRED");
      if (input.decision === "changes_requested" && (!input.note || input.note.length < 5)) throw new AppError("Give the teacher a clear revision note.", 400, "REVIEW_NOTE_REQUIRED");

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey(session.schoolId, input.id)}))`;
      const plans = await tx.$queryRaw<Array<{ id: string; teacherId: string; status: string; termLocked: boolean | null }>>`
        SELECT lp."id",lp."teacherId",lp."status",t."isLocked" AS "termLocked"
        FROM "LessonPlan" lp LEFT JOIN "Term" t ON t."id"=lp."termId" AND t."schoolId"=lp."schoolId"
        WHERE lp."schoolId"=${session.schoolId} AND lp."id"=${input.id} LIMIT 1`;
      const current = plans[0];
      if (!current) throw new AppError("Lesson plan not found.", 404, "LESSON_NOT_FOUND");
      if (current.teacherId === session.userId) throw new ForbiddenError("A reviewer cannot approve their own learning plan.");
      if (current.status !== "submitted") throw new AppError("Only a submitted learning plan can be reviewed.", 409, "LESSON_NOT_SUBMITTED");
      if (current.termLocked) throw new AppError("This learning plan belongs to a locked term.", 409, "TERM_LOCKED");

      const changed = await tx.$executeRaw`
        UPDATE "LessonPlan" SET "status"=${input.decision},"reviewerId"=${session.userId},"reviewNote"=${input.note ?? null},"reviewedAt"=CURRENT_TIMESTAMP,
          "updatedAt"=GREATEST(CURRENT_TIMESTAMP,"updatedAt" + INTERVAL '1 millisecond')
        WHERE "schoolId"=${session.schoolId} AND "id"=${input.id} AND "status"='submitted'`;
      if (changed !== 1) throw new AppError("This learning plan changed while you were reviewing it. Refresh and try again.", 409, "CONCURRENT_REVIEW");
      const reviewId = createId();
      await tx.$executeRaw`
        INSERT INTO "LessonPlanReview" ("id","schoolId","lessonPlanId","reviewerId","decision","reasonCode","note")
        VALUES (${reviewId},${session.schoolId},${input.id},${session.userId},${input.decision},${input.decision === "changes_requested" ? input.reasonCode ?? null : null},${input.note ?? null})`;
      await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "lesson_plan.reviewed_v2", entityType: "LessonPlan", entityId: input.id, before: { status: current.status }, after: { status: input.decision, reasonCode: input.reasonCode ?? null, note: input.note ?? null } });
      return { ok: true, decision: input.decision };
    }));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "INVALID_REVIEW", message: "Complete the review decision before submitting." }, { status: 400 });
    return routeError(error);
  }
}
