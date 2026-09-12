import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { appendSchoolAudit } from "@/lib/audit";
import { getSchoolAuthorization } from "@/lib/authorization";
import { withTenant, type TenantDb } from "@/lib/db";
import { AppError, ForbiddenError, routeError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import { selectAcademicTerm, termLifecycle } from "@/lib/term-date";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx", "xls", "xlsx", "ppt", "pptx"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
]);

type TermWithWeeks = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isLocked: boolean;
  academicYear: { name: string };
  teachingWeeks: number;
};

type TeacherPlanRow = {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  weekNumber: number;
  status: string;
  reviewNote: string | null;
  reviewedAt: Date | null;
  submittedAt: Date | null;
  updatedAt: Date;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

function safeFileName(name: string) {
  return name.replace(/[\r\n\u0000]/g, "").replace(/[^a-zA-Z0-9._() -]/g, "_").slice(0, 180) || "lesson-plan";
}

function fileExtension(name: string) {
  const part = name.split(".").pop();
  return part ? part.toLowerCase() : "";
}

async function teacherContext(tx: TenantDb, schoolId: string, userId: string) {
  const access = await getSchoolAuthorization(tx, userId);
  if (access.workspace !== "teacher" || !access.isTeacher) throw new ForbiddenError("Lesson-plan submission is only available inside the Teacher Workspace.");
  if (!(await hasPermission(tx, userId, "lesson_plans:manage"))) throw new ForbiddenError("You do not have lesson-plan authoring permission.");

  const [settings, baseTerms, assignments] = await Promise.all([
    tx.schoolSettings.findUnique({ where: { schoolId }, select: { timezone: true } }),
    tx.term.findMany({
      where: { schoolId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, startDate: true, endDate: true, isLocked: true, academicYear: { select: { name: true } } },
    }),
    tx.classSubjectTeacher.findMany({
      where: { schoolId, OR: [{ teacherId: userId }, { class: { classTeacherId: userId } }] },
      select: {
        classId: true,
        subjectId: true,
        class: { select: { name: true } },
        subject: { select: { name: true } },
      },
      orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
    }),
  ]);

  const weeks = await tx.$queryRawUnsafe<Array<{ id: string; teachingWeeks: number }>>(
    `SELECT "id", "teachingWeeks" FROM "Term" WHERE "schoolId"=$1`,
    schoolId,
  );
  const weekMap = new Map(weeks.map((term) => [term.id, term.teachingWeeks]));
  const terms: TermWithWeeks[] = baseTerms.map((term) => ({ ...term, teachingWeeks: weekMap.get(term.id) ?? 13 }));
  const timezone = settings?.timezone || "Africa/Accra";
  const activeTerm = selectAcademicTerm(terms, undefined, new Date(), timezone);
  const uniqueAssignments = Array.from(new Map(assignments.map((item) => [`${item.classId}:${item.subjectId}`, item])).values());
  return { access, timezone, activeTerm, assignments: uniqueAssignments };
}

function weekDate(term: TermWithWeeks, weekNumber: number) {
  const start = Date.UTC(term.startDate.getUTCFullYear(), term.startDate.getUTCMonth(), term.startDate.getUTCDate());
  const candidate = new Date(start + (weekNumber - 1) * 7 * 86400000);
  return candidate > term.endDate ? term.endDate : candidate;
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      const ctx = await teacherContext(tx, session.schoolId, session.userId);
      const term = ctx.activeTerm;
      const rows = term
        ? await tx.$queryRawUnsafe<TeacherPlanRow[]>(`
            SELECT lp."id",lp."classId",c."name" AS "className",lp."subjectId",s."name" AS "subjectName",
              lp."weekNumber",lp."status",lp."reviewNote",lp."reviewedAt",lp."submittedAt",lp."updatedAt",
              a."fileName",a."mimeType",a."sizeBytes"
            FROM "LessonPlan" lp
            JOIN "Class" c ON c."id"=lp."classId" AND c."schoolId"=lp."schoolId"
            JOIN "Subject" s ON s."id"=lp."subjectId" AND s."schoolId"=lp."schoolId"
            LEFT JOIN "LessonPlanAttachment" a ON a."lessonPlanId"=lp."id" AND a."schoolId"=lp."schoolId"
            WHERE lp."schoolId"=$1 AND lp."teacherId"=$2 AND lp."termId"=$3
            ORDER BY lp."weekNumber" DESC,c."name" ASC,s."name" ASC,lp."updatedAt" DESC`,
            session.schoolId,
            session.userId,
            term.id,
          )
        : [];

      return NextResponse.json({
        activeTerm: term ? {
          id: term.id,
          name: term.name,
          academicYear: term.academicYear.name,
          teachingWeeks: term.teachingWeeks,
          lifecycle: termLifecycle(term, new Date(), ctx.timezone),
        } : null,
        assignments: ctx.assignments.map((item) => ({
          classId: item.classId,
          className: item.class.name,
          subjectId: item.subjectId,
          subjectName: item.subject.name,
        })),
        rows,
      });
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const form = await request.formData();
    const classId = String(form.get("classId") || "").trim();
    const subjectId = String(form.get("subjectId") || "").trim();
    const weekNumber = Number(form.get("weekNumber"));
    const suppliedFile = form.get("file");

    if (!classId || !subjectId || !Number.isInteger(weekNumber)) throw new AppError("Choose a class, subject and teaching week.", 400, "LESSON_PLAN_CONTEXT_REQUIRED");
    if (!(suppliedFile instanceof File) || suppliedFile.size <= 0) throw new AppError("Choose a lesson-plan file to submit.", 400, "LESSON_PLAN_FILE_REQUIRED");
    if (suppliedFile.size > MAX_FILE_BYTES) throw new AppError("Lesson-plan files must be 10 MB or smaller.", 400, "LESSON_PLAN_FILE_TOO_LARGE");

    const fileName = safeFileName(suppliedFile.name);
    const extension = fileExtension(fileName);
    const mimeType = suppliedFile.type || "application/octet-stream";
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new AppError("Use PDF, Word, Excel, PowerPoint, JPG, PNG or WEBP lesson-plan files.", 400, "LESSON_PLAN_FILE_TYPE");
    }
    const content = Buffer.from(await suppliedFile.arrayBuffer());

    return await withTenant(session.schoolId, async (tx) => {
      const ctx = await teacherContext(tx, session.schoolId, session.userId);
      const term = ctx.activeTerm;
      if (!term) throw new AppError("There is no single active academic term. Ask school management to correct Terms & Calendar first.", 409, "ACTIVE_TERM_REQUIRED");
      if (termLifecycle(term, new Date(), ctx.timezone).state !== "active") throw new AppError("Lesson plans can only be submitted in the active, unlocked term.", 409, "TERM_NOT_WRITABLE");
      if (weekNumber < 1 || weekNumber > term.teachingWeeks) throw new AppError(`Choose a teaching week from Week 1 to Week ${term.teachingWeeks}.`, 400, "LESSON_PLAN_WEEK_OUT_OF_RANGE");
      const assignment = ctx.assignments.find((item) => item.classId === classId && item.subjectId === subjectId);
      if (!assignment) throw new ForbiddenError("That class and subject are outside your teaching scope.");

      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `lesson-file:${session.schoolId}:${session.userId}:${term.id}:${classId}:${subjectId}:${weekNumber}`);
      const existing = await tx.$queryRawUnsafe<Array<{ id: string; status: string; reviewNote: string | null }>>(
        `SELECT "id","status","reviewNote" FROM "LessonPlan" WHERE "schoolId"=$1 AND "teacherId"=$2 AND "termId"=$3 AND "classId"=$4 AND "subjectId"=$5 AND "weekNumber"=$6 ORDER BY "updatedAt" DESC LIMIT 1`,
        session.schoolId,
        session.userId,
        term.id,
        classId,
        subjectId,
        weekNumber,
      );
      const previous = existing[0] ?? null;
      if (previous && ["submitted", "approved", "completed", "archived"].includes(previous.status)) {
        throw new AppError(previous.status === "submitted" ? "This week’s lesson plan is already awaiting review." : "This week’s lesson plan has already been accepted and cannot be replaced.", 409, "LESSON_PLAN_ALREADY_FINAL");
      }

      const lessonPlanId = previous?.id ?? createId();
      const plannedDate = weekDate(term, weekNumber);
      const title = `${assignment.subject.name} · Week ${weekNumber}`;
      const summary = `Lesson plan submitted as ${fileName}.`;

      if (previous) {
        await tx.$executeRawUnsafe(`
          UPDATE "LessonPlan"
          SET "title"=$1,"content"=$2,"plannedDate"=$3,"status"='submitted',"reviewerId"=NULL,"reviewNote"=NULL,
              "reviewedAt"=NULL,"submittedAt"=NOW(),"weekNumber"=$4,"updatedAt"=NOW()
          WHERE "id"=$5 AND "schoolId"=$6`,
          title, summary, plannedDate, weekNumber, lessonPlanId, session.schoolId,
        );
      } else {
        await tx.$executeRawUnsafe(`
          INSERT INTO "LessonPlan" ("id","schoolId","teacherId","classId","subjectId","termId","title","content","plannedDate","status","submittedAt","weekNumber","createdAt","updatedAt")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted',NOW(),$10,NOW(),NOW())`,
          lessonPlanId, session.schoolId, session.userId, classId, subjectId, term.id, title, summary, plannedDate, weekNumber,
        );
      }

      const attachmentId = createId();
      await tx.$executeRawUnsafe(`
        INSERT INTO "LessonPlanAttachment" ("id","schoolId","lessonPlanId","fileName","mimeType","sizeBytes","content","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        ON CONFLICT ("schoolId","lessonPlanId") DO UPDATE SET
          "fileName"=EXCLUDED."fileName","mimeType"=EXCLUDED."mimeType","sizeBytes"=EXCLUDED."sizeBytes","content"=EXCLUDED."content","updatedAt"=NOW()`,
        attachmentId, session.schoolId, lessonPlanId, fileName, mimeType, content.length, content,
      );

      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: previous ? "lesson_plan.resubmitted_file" : "lesson_plan.submitted_file",
        entityType: "LessonPlan",
        entityId: lessonPlanId,
        before: previous ? { status: previous.status, reviewNote: previous.reviewNote } : undefined,
        after: { termId: term.id, classId, subjectId, weekNumber, fileName, sizeBytes: content.length, status: "submitted" },
      });

      return NextResponse.json({ ok: true, id: lessonPlanId, status: "submitted" });
    });
  } catch (error) {
    return routeError(error);
  }
}
