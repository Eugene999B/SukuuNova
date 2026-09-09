import { assertLessonSubmissionReady, editLessonPlan, lessonEditSchema, lessonPlanFieldsSchema } from "@/lib/academic-authoring-service";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { routeError, ForbiddenError, AppError } from "@/lib/errors";

const reviewReasonSchema = z.enum(["curriculum_alignment","learning_outcomes","assessment","differentiation","resources","clarity","timing","other"]);
const createSchema=z.object({
  classId:z.string().min(1),subjectId:z.string().min(1),termId:z.string().min(1).optional(),title:z.string().trim().min(3).max(160),
  ...lessonPlanFieldsSchema.shape,
  plannedDate:z.coerce.date(),status:z.enum(["draft","submitted"]).default("draft")
});
const patchSchema=z.object({
  id:z.string().min(1),
  status:z.enum(["draft","submitted","approved","changes_requested","completed","archived"]),
  reviewNote:z.string().trim().max(2000).optional(),
  reviewReason:reviewReasonSchema.optional(),
  reflection:z.string().trim().max(5000).optional(),
});
type PlanRow={
  id:string;schoolId:string;teacherId:string;teacherName:string;classId:string;className:string;subjectId:string;subjectName:string;termId:string|null;termName:string|null;
  title:string;objective:string|null;content:string;topic:string|null;subTopic:string|null;curriculumObjective:string|null;learningOutcomes:string|null;priorKnowledge:string|null;
  materials:string|null;introduction:string|null;development:string|null;differentiatedActivities:string|null;assessment:string|null;conclusion:string|null;homework:string|null;reflection:string|null;
  resources:unknown;plannedDate:Date;status:string;reviewNote:string|null;reviewedAt:Date|null;submittedAt:Date|null;completedAt:Date|null;archivedAt:Date|null;createdAt:Date;updatedAt:Date
};
type ReviewRow={id:string;lessonPlanId:string;reviewerId:string;reviewerName:string;decision:string;reasonCode:string|null;note:string|null;createdAt:Date};
const lockKey=(prefix:string,schoolId:string,id:string)=>`${prefix}:${schoolId}:${id}`;

export async function GET(){
  try{
    const session=await requireSchoolSession();
    return NextResponse.json(await withTenant(session.schoolId,async tx=>{
      const review=await hasPermission(tx,session.userId,"lesson_plans:review");
      const manage=await hasPermission(tx,session.userId,"lesson_plans:manage");
      if(!review&&!manage)throw new ForbiddenError("You do not have access to lesson planning.");
      const scope=review?Prisma.sql`lp."schoolId" = ${session.schoolId}`:Prisma.sql`lp."schoolId" = ${session.schoolId} AND lp."teacherId" = ${session.userId}`;
      const rows=await tx.$queryRaw<PlanRow[]>`
        SELECT lp."id",lp."schoolId",lp."teacherId",u."name" AS "teacherName",lp."classId",c."name" AS "className",lp."subjectId",s."name" AS "subjectName",
          lp."termId",t."name" AS "termName",lp."title",lp."objective",lp."content",lp."topic",lp."subTopic",lp."curriculumObjective",lp."learningOutcomes",
          lp."priorKnowledge",lp."materials",lp."introduction",lp."development",lp."differentiatedActivities",lp."assessment",lp."conclusion",lp."homework",lp."reflection",
          lp."resources",lp."plannedDate",lp."status",lp."reviewNote",lp."reviewedAt",lp."submittedAt",lp."completedAt",lp."archivedAt",lp."createdAt",lp."updatedAt"
        FROM "LessonPlan" lp
        JOIN "User" u ON u."id"=lp."teacherId" AND u."schoolId"=lp."schoolId"
        JOIN "Class" c ON c."id"=lp."classId" AND c."schoolId"=lp."schoolId"
        JOIN "Subject" s ON s."id"=lp."subjectId" AND s."schoolId"=lp."schoolId"
        LEFT JOIN "Term" t ON t."id"=lp."termId" AND t."schoolId"=lp."schoolId"
        WHERE ${scope}
        ORDER BY lp."plannedDate" DESC,lp."updatedAt" DESC LIMIT 500`;
      const reviews=await tx.$queryRaw<ReviewRow[]>`
        SELECT r."id",r."lessonPlanId",r."reviewerId",u."name" AS "reviewerName",r."decision",r."reasonCode",r."note",r."createdAt"
        FROM "LessonPlanReview" r
        JOIN "LessonPlan" lp ON lp."id"=r."lessonPlanId" AND lp."schoolId"=r."schoolId"
        JOIN "User" u ON u."id"=r."reviewerId" AND u."schoolId"=r."schoolId"
        WHERE ${scope}
        ORDER BY r."createdAt" DESC LIMIT 2000`;
      const assignments=manage?await tx.classSubjectTeacher.findMany({where:{schoolId:session.schoolId,teacherId:session.userId},select:{classId:true,subjectId:true,class:{select:{name:true,level:true}},subject:{select:{name:true}}},orderBy:{classId:"asc"}}):[];
      const terms=await tx.term.findMany({where:{schoolId:session.schoolId},orderBy:{startDate:"desc"},take:12,select:{id:true,name:true,academicYear:{select:{name:true}}}});
      return{rows,reviews,assignments,terms,review,manage,me:session.userId};
    }));
  }catch(error){return routeError(error)}
}

export async function POST(request:Request){
  try{
    const session=await requireSchoolSession();
    const input=createSchema.parse(await request.json());
    if(input.status==="submitted")assertLessonSubmissionReady(input);
    await withTenant(session.schoolId,async tx=>{
      await requirePermission(tx,session.userId,"lesson_plans:manage");
      const assignment=await tx.classSubjectTeacher.findFirst({where:{schoolId:session.schoolId,teacherId:session.userId,classId:input.classId,subjectId:input.subjectId}});
      const classTeacher=await tx.class.findFirst({where:{id:input.classId,schoolId:session.schoolId,classTeacherId:session.userId},select:{id:true}});
      if(!assignment&&!classTeacher)throw new ForbiddenError("You can only create a lesson plan for a class and subject you teach (including form classes).");
      if(!assignment){const subject=await tx.subject.findFirst({where:{id:input.subjectId,schoolId:session.schoolId},select:{id:true}});if(!subject)throw new AppError("Selected subject was not found in this school.",404,"SUBJECT_NOT_FOUND");}
      if(input.termId){
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey("term-mutation",session.schoolId,input.termId)}))`;
        const term=await tx.term.findFirst({where:{id:input.termId,schoolId:session.schoolId}});
        if(!term)throw new AppError("Selected term was not found in this school.",404,"TERM_NOT_FOUND");
        if(term.isLocked)throw new AppError("Selected term is locked.",409,"TERM_LOCKED");
        if(input.plannedDate<term.startDate||input.plannedDate>term.endDate)throw new AppError("Lesson date must fall inside the selected term.",400,"DATE_OUTSIDE_TERM");
      }
      const id=createId();
      await tx.$executeRaw`
        INSERT INTO "LessonPlan" (
          "id","schoolId","teacherId","classId","subjectId","termId","title","objective","content","topic","subTopic","curriculumObjective","learningOutcomes",
          "priorKnowledge","materials","introduction","development","differentiatedActivities","assessment","conclusion","homework","resources","plannedDate","status","submittedAt"
        ) VALUES (
          ${id},${session.schoolId},${session.userId},${input.classId},${input.subjectId},${input.termId??null},${input.title},${input.objective??null},${input.content},${input.topic??null},
          ${input.subTopic??null},${input.curriculumObjective??null},${input.learningOutcomes??null},${input.priorKnowledge??null},${input.materials??null},${input.introduction??null},
          ${input.development??null},${input.differentiatedActivities??null},${input.assessment??null},${input.conclusion??null},${input.homework??null},${JSON.stringify(input.resources??[])}::jsonb,
          ${input.plannedDate},${input.status},CASE WHEN ${input.status}='submitted' THEN CURRENT_TIMESTAMP ELSE NULL END
        )`;
      await appendSchoolAudit(tx,{schoolId:session.schoolId,actorId:session.userId,action:"lesson_plan.created",entityType:"LessonPlan",entityId:id,after:{title:input.title,classId:input.classId,subjectId:input.subjectId,status:input.status,topic:input.topic??null}});
    });
    return NextResponse.json({ok:true},{status:201});
  }catch(error){return routeError(error)}
}

export async function PATCH(request:Request){
  try{
    const session=await requireSchoolSession();
    const input=patchSchema.parse(await request.json());
    return NextResponse.json(await withTenant(session.schoolId,async tx=>{
      const seed=await tx.$queryRaw<Array<{termId:string|null}>>`SELECT "termId" FROM "LessonPlan" WHERE "id"=${input.id} AND "schoolId"=${session.schoolId} LIMIT 1`;
      if(!seed[0])throw new AppError("Lesson plan not found in this school.",404,"NOT_FOUND");
      if(seed[0].termId)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey("term-mutation",session.schoolId,seed[0].termId)}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey("lesson-plan-workflow",session.schoolId,input.id)}))`;
      const review=await hasPermission(tx,session.userId,"lesson_plans:review");
      const manage=await hasPermission(tx,session.userId,"lesson_plans:manage");
      const rows=await tx.$queryRaw<Array<{id:string;teacherId:string;status:string;termId:string|null;termLocked:boolean|null}>>`
        SELECT lp."id",lp."teacherId",lp."status",lp."termId",t."isLocked" AS "termLocked"
        FROM "LessonPlan" lp LEFT JOIN "Term" t ON t."id"=lp."termId" AND t."schoolId"=lp."schoolId"
        WHERE lp."id"=${input.id} AND lp."schoolId"=${session.schoolId} LIMIT 1`;
      const current=rows[0];
      if(!current)throw new AppError("Lesson plan not found in this school.",404,"NOT_FOUND");
      if(current.termLocked)throw new AppError("This lesson plan belongs to a locked term and cannot be changed.",409,"TERM_LOCKED");
      const from=current.status,to=input.status,isOwner=current.teacherId===session.userId;
      const isReviewAction=to==="approved"||to==="changes_requested";
      if(isReviewAction){
        if(!review)throw new ForbiddenError("Only academic reviewers can approve or request changes.");
        if(isOwner)throw new ForbiddenError("Reviewers cannot approve their own lesson plan.");
        if(from!=="submitted")throw new AppError("Only a submitted lesson plan can be reviewed. The teacher must resubmit a returned plan before another decision.",409,"INVALID_TRANSITION");
        if(to==="changes_requested"&&!input.reviewNote?.trim())throw new AppError("Explain what the teacher should revise before requesting changes.",400,"REVIEW_NOTE_REQUIRED");
        if(to==="changes_requested"&&!input.reviewReason)throw new AppError("Choose a revision reason before requesting changes.",400,"REVIEW_REASON_REQUIRED");
      }else{
        if(!manage||!isOwner)throw new ForbiddenError("You can only update lesson plans you created.");
        const allowed:Record<string,string[]>={submitted:["draft"],approved:["completed"],completed:["archived"]};
        if(!(allowed[from]??[]).includes(to))throw new AppError("Use the lesson editor to submit drafts or returned plans. This status change is not allowed here.",409,"INVALID_TRANSITION");
        if(to==="completed"&&(!input.reflection||input.reflection.trim().length<10))throw new AppError("Add a short teaching reflection before marking the lesson completed.",400,"REFLECTION_REQUIRED");
      }
      const reviewed=isReviewAction;
      const updateCount=await tx.$executeRaw`
        UPDATE "LessonPlan" SET
          "status"=${input.status},
          "reviewNote"=CASE WHEN ${reviewed} THEN ${input.reviewNote??null} ELSE "reviewNote" END,
          "reviewerId"=CASE WHEN ${reviewed} THEN ${session.userId} ELSE "reviewerId" END,
          "reviewedAt"=CASE WHEN ${reviewed} THEN CURRENT_TIMESTAMP ELSE "reviewedAt" END,
          "reflection"=CASE WHEN ${to}='completed' THEN ${input.reflection??null} ELSE "reflection" END,
          "completedAt"=CASE WHEN ${to}='completed' THEN CURRENT_TIMESTAMP ELSE "completedAt" END,
          "archivedAt"=CASE WHEN ${to}='archived' THEN CURRENT_TIMESTAMP ELSE "archivedAt" END,
          "updatedAt"=GREATEST(CURRENT_TIMESTAMP,"updatedAt" + INTERVAL '1 millisecond')
        WHERE "id"=${input.id} AND "schoolId"=${session.schoolId} AND "status"=${from}`;
      if(updateCount!==1)throw new AppError("This lesson plan changed while you were working. Refresh and try again.",409,"CONCURRENT_UPDATE");
      if(reviewed){
        const reviewId=createId();
        await tx.$executeRaw`INSERT INTO "LessonPlanReview" ("id","schoolId","lessonPlanId","reviewerId","decision","reasonCode","note") VALUES (${reviewId},${session.schoolId},${input.id},${session.userId},${to},${to==="changes_requested"?(input.reviewReason??null):null},${input.reviewNote??null})`;
      }
      await appendSchoolAudit(tx,{schoolId:session.schoolId,actorId:session.userId,action:reviewed?"lesson_plan.reviewed":"lesson_plan.updated",entityType:"LessonPlan",entityId:input.id,before:{status:from},after:{status:input.status,reviewNote:reviewed?(input.reviewNote??null):undefined,reviewReason:reviewed?(input.reviewReason??null):undefined}});
      return{ok:true};
    }));
  }catch(error){return routeError(error)}
}

export async function PUT(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = lessonEditSchema.parse(await request.json());
    return NextResponse.json(await withTenant(session.schoolId, (tx) =>
      editLessonPlan(tx, { schoolId: session.schoolId, actorId: session.userId }, input)
    ));
  } catch (error) { return routeError(error); }
}
