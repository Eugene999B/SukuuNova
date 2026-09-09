import { createId } from "@paralleldrive/cuid2";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { appendSchoolAudit } from "./audit";
import { safeResourceUrl } from "./resource-url";
import { lockSchoolAccess } from "./owner-governance";
import { requireCanAssignRoles } from "./authorization";
import { createSchoolUserInTransaction } from "./school-services";

type Row = Record<string, unknown>;
const optional = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const text = (max: number) => z.string().trim().max(max).optional().nullable();
const questionSchema = z.object({ id: z.string().min(1).max(100).optional(), label: z.string().trim().min(1).max(300), type: z.enum(["shortText","longText","select"]).default("longText"), required: z.boolean().default(false), options: z.array(z.string().trim().min(1).max(300)).max(10).default([]) });
const postingFields = { title: z.string().trim().min(1).max(500), department:text(160), employmentType:text(120), description:text(10000), instructions:text(6000), closingDate:text(100), screeningQuestions:z.array(questionSchema).max(20).optional() };
const contactFields = { name:z.string().trim().min(1).max(200), email:z.union([z.string().trim().email().max(320),z.literal("")]).optional().nullable(), phone:text(80), resumeUrl:text(2000), coverLetter:text(12000), answers:z.record(z.string().max(100),z.string().max(4000)).default({}) };
export const publicApplicationSchema = z.object({ ...contactFields, submissionKey:z.string().uuid() });
const actionSchema = z.discriminatedUnion("action",[
 z.object({ action:z.literal("createPosting"), ...postingFields }),
 z.object({ action:z.literal("updatePosting"), postingId:z.string().min(1), ...z.object(postingFields).partial().shape, status:z.enum(["open","paused","closed"]).optional() }),
 z.object({ action:z.literal("setStatus"), postingId:z.string().min(1), status:z.enum(["open","paused","closed"]) }),
 z.object({ action:z.literal("getPublicLink"), postingId:z.string().min(1) }),
 z.object({ action:z.literal("setApplicantStatus"), applicantId:z.string().min(1), expectedStatus:z.string().min(1), status:z.enum(["new","screening","interview","offer","hired","rejected"]), notes:text(4000) }),
 z.object({ action:z.literal("createApplicant"), postingId:z.string().min(1), ...contactFields, notes:text(4000) }),
 z.object({ action:z.literal("convertApplicant"), applicantId:z.string().min(1), initialPassword:z.string().min(12).max(256), roleName:text(100) })
]);
function deadline(value: unknown) {
  if (!value) return null;
  const raw = String(value);
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw+"T23:59:59.999Z" : raw);
  if (!Number.isFinite(parsed.getTime()) || (/^\d{4}-\d{2}-\d{2}$/.test(raw) && parsed.toISOString().slice(0,10)!==raw)) throw new AppError("Enter a valid closing date.",400,"INVALID_DEADLINE");
  return parsed;
}
function questionList(value: z.infer<typeof questionSchema>[] = []) {
  const questions=value.map(question=>({...question,id:question.id??createId()}));
  if(new Set(questions.map(question=>question.id)).size!==questions.length)throw new AppError("Screening question IDs must be distinct.",400,"INVALID_QUESTIONS");
  if(questions.some(question=>question.type==="select"&&question.options.length<2))throw new AppError("Choice questions need at least two options.",400,"INVALID_QUESTIONS");
  return questions;
}
async function postingFor(tx:TenantDb,schoolId:string,postingId:string) {
  const rows=await tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3RecruitmentPosting" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`,schoolId,postingId);
  if(!rows[0])throw new AppError("Vacancy not found.",404,"NOT_FOUND");
  return rows[0];
}
export async function recruitmentOverview(tx:TenantDb,schoolId:string,actorId:string) {
  await requirePermission(tx,actorId,"recruitment:manage");
  const [postings,applicants]=await Promise.all([
    tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3RecruitmentPosting" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC`,schoolId),
    tx.$queryRawUnsafe<Row[]>(`SELECT a.*,p."title" AS "postingTitle" FROM "P3Applicant" a JOIN "P3RecruitmentPosting" p ON p."id"=a."postingId" AND p."schoolId"=a."schoolId" WHERE a."schoolId"=$1 ORDER BY a."createdAt" DESC LIMIT 1000`,schoolId)
  ]);
  return {postings,applicants:applicants.map((applicant):Row=>({...applicant,resumeUrl:safeResourceUrl(applicant.resumeUrl)}))};
}
export async function publicPosting(tx:TenantDb,schoolId:string,token:string) {
  const rows=await tx.$queryRawUnsafe<Row[]>(`SELECT "id","title","department","employmentType","description","instructions","closingDate","status","screeningQuestions" FROM "P3RecruitmentPosting" WHERE "schoolId"=$1 AND "publicToken"=$2 FOR UPDATE`,schoolId,token);
  const posting=rows[0];if(!posting)throw new AppError("This application link is invalid.",404,"NOT_FOUND");
  return posting;
}
function requireOpen(posting:Row) {
  if(posting.status!=="open"||(posting.closingDate&&new Date(posting.closingDate as string|Date).getTime()<=Date.now()))throw new AppError("Applications for this vacancy are closed.",410,"POSTING_CLOSED");
}
export function requirePublicPostingOpen(posting:Row){requireOpen(posting);return posting;}
function applicationData(posting:Row,input:z.infer<typeof publicApplicationSchema>|z.infer<z.ZodObject<typeof contactFields>>) {
  const email=optional(input.email)?.toLowerCase()??null,phone=optional(input.phone);
  if(!email&&!phone)throw new AppError("Provide an email address or phone number.",400,"CONTACT_REQUIRED");
  const resume=optional(input.resumeUrl),resumeUrl=resume?safeResourceUrl(resume):null;
  if(resume&&!resumeUrl)throw new AppError("CV links must use HTTP, HTTPS or a same-site path.",400,"INVALID_RESOURCE_URL");
  const questions=Array.isArray(posting.screeningQuestions)?posting.screeningQuestions as Array<{id:string;label:string;required?:boolean;options?:string[]}>:[];
  const answers:Record<string,string>={};
  if(Object.keys(input.answers).some(key=>!questions.some(question=>question.id===key)))throw new AppError("A screening question changed. Reload this vacancy before submitting.",409,"QUESTIONS_CHANGED");
  for(const question of questions){
    const answer=(input.answers[question.id]??"").trim();
    if(question.required&&!answer)throw new AppError("Please answer: "+question.label,400,"REQUIRED_ANSWER");
    if(answer&&question.options?.length&&!question.options.includes(answer))throw new AppError("Choose a listed answer for: "+question.label,400,"INVALID_ANSWER");
    answers[question.id]=answer;
  }
  return {name:input.name,email,phone,resumeUrl,coverLetter:optional(input.coverLetter),answers};
}
async function insertApplicant(tx:TenantDb,schoolId:string,postingId:string,data:ReturnType<typeof applicationData>,key:string|null,hash:string|null,notes:string|null) {
  const id=createId();
  await tx.$executeRawUnsafe(`INSERT INTO "P3Applicant" ("id","schoolId","postingId","name","email","phone","resumeUrl","status","answers","coverLetter","submissionKey","submissionHash","notes") VALUES($1,$2,$3,$4,$5,$6,$7,'new',$8::jsonb,$9,$10,$11,$12)`,id,schoolId,postingId,data.name,data.email,data.phone,data.resumeUrl,JSON.stringify(data.answers),data.coverLetter,key,hash,notes);
  return {id};
}
export async function applyToPublicPosting(tx:TenantDb,schoolId:string,token:string,body:unknown) {
  const input=publicApplicationSchema.parse(body),posting=await publicPosting(tx,schoolId,token);
  const prior=await tx.$queryRawUnsafe<Row[]>(`SELECT "id","name","email","phone","resumeUrl","coverLetter","answers" FROM "P3Applicant" WHERE "schoolId"=$1 AND "postingId"=$2 AND "submissionKey"=$3`,schoolId,posting.id,input.submissionKey);
  if(prior[0]) {
    // A receipt belongs to the recorded application, not today's screening template.
    // PostgreSQL JSONB can reorder keys, so compare both payloads in the same stored-key order.
    const recorded=prior[0],answers=recorded.answers as Record<string,string>;
    const keys=Object.keys(answers).sort();
    const conflict=()=>new AppError("This submission reference already recorded different answers. Keep the original application reference.",409,"SUBMISSION_CONFLICT");
    if(Object.keys(input.answers).some(key=>!keys.includes(key)))throw conflict();
    const originalQuestions={screeningQuestions:keys.map(id=>({id,label:id}))};
    const retry=applicationData(originalQuestions,input);
    const original={name:recorded.name,email:recorded.email,phone:recorded.phone,resumeUrl:recorded.resumeUrl,coverLetter:recorded.coverLetter,answers:Object.fromEntries(keys.map(key=>[key,answers[key]]))};
    if(JSON.stringify(original)!==JSON.stringify(retry))throw conflict();
    return {applicationId:String(recorded.id)};
  }
  requireOpen(posting);
  const data=applicationData(posting,input),hash=createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const result=await insertApplicant(tx,schoolId,String(posting.id),data,input.submissionKey,hash,null);
  return {applicationId:result.id};
}
export async function recruitmentAction(tx:TenantDb,schoolId:string,actorId:string,body:unknown) {
  const input=actionSchema.parse(body);
  // Account governance uses school-lock then applicant-lock everywhere.
  if(input.action==="convertApplicant")await lockSchoolAccess(tx,schoolId);
  await requirePermission(tx,actorId,"recruitment:manage");
  if(input.action==="createPosting"){
    const id=createId(),publicToken=createId(),questions=questionList(input.screeningQuestions);
    await tx.$executeRawUnsafe(`INSERT INTO "P3RecruitmentPosting" ("id","schoolId","title","department","employmentType","description","closingDate","createdBy","publicToken","instructions","screeningQuestions","status") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'open')`,id,schoolId,input.title,optional(input.department),optional(input.employmentType),optional(input.description),deadline(input.closingDate),actorId,publicToken,optional(input.instructions),JSON.stringify(questions));
    await appendSchoolAudit(tx,{schoolId,actorId,action:"recruitment.posting_created",entityType:"P3RecruitmentPosting",entityId:id,after:{title:input.title}});
    return {id,publicToken};
  }
  if(input.action==="setApplicantStatus"||input.action==="convertApplicant"){
    const rows=await tx.$queryRawUnsafe<Row[]>(`SELECT * FROM "P3Applicant" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`,schoolId,input.applicantId);
    const applicant=rows[0];if(!applicant)throw new AppError("Applicant not found.",404,"NOT_FOUND");
    if(input.action==="setApplicantStatus"){
      if(applicant.staffUserId||applicant.status==="converted")throw new AppError("A converted candidate is managed through their staff account.",409,"ALREADY_CONVERTED");
      if(applicant.status!==input.expectedStatus)throw new AppError("This candidate changed. Refresh the pipeline before updating.",409,"APPLICANT_CONFLICT");
      await tx.$executeRawUnsafe(`UPDATE "P3Applicant" SET "status"=$3,"notes"=CASE WHEN $4::boolean THEN $5 ELSE "notes" END WHERE "schoolId"=$1 AND "id"=$2`,schoolId,input.applicantId,input.status,input.notes!==undefined,optional(input.notes));
      await appendSchoolAudit(tx,{schoolId,actorId,action:"recruitment.applicant_status_changed",entityType:"P3Applicant",entityId:input.applicantId,before:{status:applicant.status},after:{status:input.status}});
      return {id:input.applicantId,status:input.status};
    }
    await requirePermission(tx,actorId,"users:write");
    if(applicant.staffUserId)return {applicantId:input.applicantId,staffUserId:String(applicant.staffUserId)};
    if(applicant.status!=="hired")throw new AppError("Record the hiring decision before creating a staff account.",409,"APPLICANT_NOT_HIRED");
    const user=await createSchoolUserInTransaction(tx,{schoolId,actorId,name:String(applicant.name),email:optional(applicant.email)??undefined,phone:optional(applicant.phone)??undefined,password:input.initialPassword});
    if(input.roleName){
      await requirePermission(tx,actorId,"settings:manage_roles");
      const role=await tx.role.findFirst({where:{schoolId,name:input.roleName},select:{id:true}});
      if(!role)throw new AppError("Role not found.",404,"ROLE_NOT_FOUND");
      await requireCanAssignRoles(tx,actorId,user.id,[role.id]);
      await tx.userRole.create({data:{schoolId,userId:user.id,roleId:role.id}});
    }
    await tx.$executeRawUnsafe(`UPDATE "P3Applicant" SET "status"='converted',"staffUserId"=$3,"convertedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`,schoolId,input.applicantId,user.id);
    await appendSchoolAudit(tx,{schoolId,actorId,action:"recruitment.applicant_converted",entityType:"P3Applicant",entityId:input.applicantId,after:{staffUserId:user.id}});
    return {applicantId:input.applicantId,staffUserId:user.id};
  }
  const posting=await postingFor(tx,schoolId,input.postingId);
  if(input.action==="createApplicant"){
    const result=await insertApplicant(tx,schoolId,input.postingId,applicationData(posting,input),null,null,optional(input.notes));
    await appendSchoolAudit(tx,{schoolId,actorId,action:"recruitment.applicant_created",entityType:"P3Applicant",entityId:result.id});
    return result;
  }
  if(input.action==="getPublicLink"){
    const publicToken=posting.publicToken?String(posting.publicToken):createId();
    if(!posting.publicToken)await tx.$executeRawUnsafe(`UPDATE "P3RecruitmentPosting" SET "publicToken"=$3 WHERE "schoolId"=$1 AND "id"=$2`,schoolId,input.postingId,publicToken);
    return {postingId:input.postingId,publicToken};
  }
  if(input.action==="setStatus"){
    await tx.$executeRawUnsafe(`UPDATE "P3RecruitmentPosting" SET "status"=$3 WHERE "schoolId"=$1 AND "id"=$2`,schoolId,input.postingId,input.status);
  } else {
    await tx.$executeRawUnsafe(`UPDATE "P3RecruitmentPosting" SET "title"=$3,"department"=$4,"employmentType"=$5,"description"=$6,"closingDate"=$7,"instructions"=$8,"screeningQuestions"=$9::jsonb,"status"=$10 WHERE "schoolId"=$1 AND "id"=$2`,schoolId,input.postingId,input.title??posting.title,input.department===undefined?posting.department:optional(input.department),input.employmentType===undefined?posting.employmentType:optional(input.employmentType),input.description===undefined?posting.description:optional(input.description),input.closingDate===undefined?posting.closingDate:deadline(input.closingDate),input.instructions===undefined?posting.instructions:optional(input.instructions),JSON.stringify(input.screeningQuestions===undefined?posting.screeningQuestions:questionList(input.screeningQuestions)),input.status??posting.status);
  }
  await appendSchoolAudit(tx,{schoolId,actorId,action:"recruitment.posting_updated",entityType:"P3RecruitmentPosting",entityId:input.postingId,before:{status:posting.status},after:{status:input.status??posting.status}});
  return {id:input.postingId};
}
