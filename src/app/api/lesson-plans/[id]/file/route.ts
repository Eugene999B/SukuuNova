import { appendSchoolAudit } from "@/lib/audit";
import { withTenant } from "@/lib/db";
import { AppError, ForbiddenError, routeError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";

type FileRow = {
  id: string;
  lessonPlanId: string;
  teacherId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer;
};

function responseFileName(name: string) {
  return name.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "lesson-plan";
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { id } = await params;
    return await withTenant(session.schoolId, async (tx) => {
      const rows = await tx.$queryRawUnsafe<FileRow[]>(`
        SELECT a."id",a."lessonPlanId",lp."teacherId",a."fileName",a."mimeType",a."sizeBytes",a."content"
        FROM "LessonPlanAttachment" a
        JOIN "LessonPlan" lp ON lp."id"=a."lessonPlanId" AND lp."schoolId"=a."schoolId"
        WHERE a."schoolId"=$1 AND a."lessonPlanId"=$2
        LIMIT 1`, session.schoolId, id);
      const file = rows[0];
      if (!file) throw new AppError("Lesson-plan file not found.", 404, "LESSON_PLAN_FILE_NOT_FOUND");

      const isOwner = file.teacherId === session.userId;
      const canAuthor = isOwner && await hasPermission(tx, session.userId, "lesson_plans:manage");
      const canReview = await hasPermission(tx, session.userId, "lesson_plans:review");
      if (!canAuthor && !canReview) throw new ForbiddenError("You do not have access to this lesson-plan file.");

      const inline = file.mimeType === "application/pdf" || file.mimeType.startsWith("image/");
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: inline ? "lesson_plan.file_viewed" : "lesson_plan.file_downloaded",
        entityType: "LessonPlan",
        entityId: file.lessonPlanId,
        after: { fileName: file.fileName, sizeBytes: file.sizeBytes },
      });

      return new Response(new Uint8Array(file.content), {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Length": String(file.sizeBytes),
          "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${responseFileName(file.fileName)}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    });
  } catch (error) {
    return routeError(error);
  }
}
