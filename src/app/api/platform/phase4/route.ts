import { NextResponse } from "next/server";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { IMPERSONATION_SECONDS, SCHOOL_COOKIE, createSchoolSessionToken, requirePlatformSession, sessionCookieOptions } from "@/lib/auth";
import { routeError, UnauthorizedError, ForbiddenError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { getPlatformSchoolScope, requirePlatformPermission } from "@/lib/platform-permissions";
import { requireSchoolScope } from "@/lib/platform-school-scope";
import { createPlatformSchool, searchCrossSchool, listPlans, createPlan, assignPlan, listBilling, updateSupportTicket, listPlatformSchools } from "@/lib/phase4-service";
import { listSupportTicketsForPlatform } from "@/lib/phase4-platform-support";
import { impersonatePlatformUser } from "@/lib/platform-impersonation-service";
import { appendPlatformAudit } from "@/lib/audit";
import { db, withTenant } from "@/lib/db";

const postSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("createSchool"),uniqueCode:z.string().min(3).max(40),schoolName:z.string().min(2).max(160),ownerName:z.string().min(2).max(160),ownerEmail:z.string().email(),ownerPassword:z.string().min(12).max(256)}),
 z.object({action:z.literal("suspendSchool"),schoolId:z.string(),suspended:z.boolean()}),
 z.object({action:z.literal("search"),q:z.string().min(1).max(120)}),
 z.object({action:z.literal("createPlan"),name:z.string().min(2).max(80),price:z.number().positive(),featureFlags:z.array(z.string().max(80)).max(30)}),
 z.object({action:z.literal("assignPlan"),schoolId:z.string(),planId:z.string()}),
 z.object({action:z.literal("generateInvoice"),schoolId:z.string(),period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}),
 z.object({action:z.literal("recordPayment"),schoolId:z.string(),invoiceId:z.string(),amount:z.number().positive(),method:z.string().min(1).max(40),reference:z.string().max(120).optional()}),
 z.object({action:z.literal("supportUpdate"),schoolId:z.string(),ticketId:z.string(),status:z.enum(["open","in_progress","resolved"]),body:z.string().max(5000).optional()}),
 z.object({action:z.literal("impersonate"),schoolId:z.string(),userId:z.string(),reason:z.string().min(5).max(500)})
]);
const postPermission:Record<z.infer<typeof postSchema>["action"],string>={createSchool:"schools.manage",suspendSchool:"schools.suspend",search:"schools.view",createPlan:"plans.manage",assignPlan:"plans.manage",generateInvoice:"billing.manage",recordPayment:"billing.manage",supportUpdate:"support.manage",impersonate:"schools.impersonate"};

async function hardenedGenerateInvoice(schoolId:string,period:string,adminId:string){
  const result=await withTenant(schoolId,async(tx)=>{
    const school=await tx.school.findUnique({where:{id:schoolId},select:{subscriptionPlan:{select:{name:true,price:true}}}});
    if(!school?.subscriptionPlan) return null;
    const existing=(await tx.$queryRawUnsafe<Array<{id:string;amount:string;status:string}>>(`SELECT "id","amount"::text,"status" FROM "PlatformInvoice" WHERE "schoolId"=$1 AND "period"=$2 LIMIT 1`,schoolId,period))[0];
    if(existing){
      const paid=(await tx.$queryRawUnsafe<Array<{paid:string}>>(`SELECT COALESCE(SUM("amount"),0)::text paid FROM "PlatformPayment" WHERE "schoolId"=$1 AND "platformInvoiceId"=$2`,schoolId,existing.id))[0];
      return {id:existing.id,period,amount:Number(existing.amount),planName:school.subscriptionPlan.name,status:existing.status,existing:true,paid:Number(paid?.paid??0)};
    }
    const created=(await tx.$queryRawUnsafe<Array<{id:string}>>(`INSERT INTO "PlatformInvoice" ("id","schoolId","period","amount","status") VALUES ($1,$2,$3,$4,'unpaid') RETURNING "id"`,createId(),schoolId,period,Number(school.subscriptionPlan.price)))[0];
    return {id:created.id,period,amount:Number(school.subscriptionPlan.price),planName:school.subscriptionPlan.name,status:"unpaid",existing:false,paid:0};
  });
  if(result) await appendPlatformAudit({actorId:adminId,action:result.existing?"platform.billing.invoice_already_exists":"platform.billing.invoice_generated",targetSchoolId:schoolId,targetEntity:`PlatformInvoice:${result.id}`,meta:result});
  return result;
}

async function hardenedRecordPayment(schoolId:string,invoiceId:string,paymentAmount:number,method:string,reference:string|undefined,adminId:string){
  const result=await withTenant(schoolId,async(tx)=>{
    const invoice=(await tx.$queryRawUnsafe<Array<{id:string;amount:string}>>(`SELECT "id","amount"::text FROM "PlatformInvoice" WHERE "id"=$1 AND "schoolId"=$2 FOR UPDATE`,invoiceId,schoolId))[0];
    if(!invoice) return null;
    if(reference){
      const duplicate=await tx.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "PlatformPayment" WHERE "schoolId"=$1 AND "reference"=$2 LIMIT 1`,schoolId,reference);
      if(duplicate.length) return {duplicateReference:true} as const;
    }
    const paymentId=createId();
    await tx.$executeRawUnsafe(`INSERT INTO "PlatformPayment" ("id","schoolId","platformInvoiceId","amount","method","reference","reconciledBy") VALUES ($1,$2,$3,$4,$5,$6,$7)`,paymentId,schoolId,invoiceId,paymentAmount,method.trim(),reference?.trim()||null,adminId);
    const paid=Number((await tx.$queryRawUnsafe<Array<{paid:string}>>(`SELECT COALESCE(SUM("amount"),0)::text paid FROM "PlatformPayment" WHERE "schoolId"=$1 AND "platformInvoiceId"=$2`,schoolId,invoiceId))[0]?.paid??0);
    const due=Number(invoice.amount);
    const status=paid>=due?"paid":"unpaid";
    await tx.$executeRawUnsafe(`UPDATE "PlatformInvoice" SET "status"=$1 WHERE "id"=$2 AND "schoolId"=$3`,status,invoiceId,schoolId);
    return {paymentId,invoiceId,due,paid,outstanding:Math.max(0,due-paid),overpaid:Math.max(0,paid-due),status};
  });
  if(!result) return null;
  if("duplicateReference" in result) return result;
  await appendPlatformAudit({actorId:adminId,action:"platform.billing.payment_recorded",targetSchoolId:schoolId,targetEntity:`PlatformInvoice:${invoiceId}`,meta:{...result,method}});
  return result;
}

async function hardenedSuspendSchool(schoolId:string,suspended:boolean,adminId:string){
  const status=suspended?"suspended":"active";
  const result=await withTenant(schoolId,async(tx)=>{
    const school=await tx.school.findUnique({where:{id:schoolId},select:{id:true,name:true,status:true}});
    if(!school) return null;
    if(school.status===status) return {...school,status,changed:false};
    await tx.school.update({where:{id:schoolId},data:{status}});
    await tx.schoolLoginDirectory.update({where:{schoolId},data:{status}});
    await tx.$executeRawUnsafe(`SELECT 1`);
    return {...school,status,changed:true};
  });
  if(!result) return null;
  await appendPlatformAudit({actorId:adminId,action:suspended?"school.suspended":"school.reactivated",targetSchoolId:schoolId,targetEntity:"School",meta:{before:result.status===status?undefined:result.status,status,changed:result.changed}});
  return result;
}

export async function GET(request:Request){try{const session=await requirePlatformSession();const url=new URL(request.url),view=url.searchParams.get("view")||"schools",schoolId=url.searchParams.get("schoolId")||"";if(view==="schools"){await requirePlatformPermission(session,"schools.view");const [schools,scope]=await Promise.all([listPlatformSchools(),getPlatformSchoolScope(session)]);const visible=scope===null?schools:schools.filter((school)=>scope.includes(String(school.schoolId)));return NextResponse.json({schools:visible});}if(view==="plans"){await requirePlatformPermission(session,"plans.manage");return NextResponse.json({plans:await listPlans(session.role)});}if(view==="billing"){await requirePlatformPermission(session,"billing.view");if(!schoolId)throw new UnauthorizedError("schoolId is required");await requireSchoolScope(session,schoolId);return NextResponse.json(await listBilling(session.role,schoolId));}if(view==="support"){await requirePlatformPermission(session,"support.view");if(!schoolId)throw new UnauthorizedError("schoolId is required");await requireSchoolScope(session,schoolId);return NextResponse.json({tickets:await listSupportTicketsForPlatform(session,schoolId)});}throw new UnauthorizedError("Unknown platform view");}catch(error){return routeError(error);}}
export async function POST(request:Request){try{const session=await requirePlatformSession();const input=await parseJson(request,postSchema);await requirePlatformPermission(session,postPermission[input.action]);switch(input.action){case"createSchool":return NextResponse.json({ok:true,result:await createPlatformSchool({adminId:session.adminId,adminRole:session.role,...input})},{status:201});case"suspendSchool":await requireSchoolScope(session,input.schoolId);{const result=await hardenedSuspendSchool(input.schoolId,input.suspended,session.adminId);if(!result)return NextResponse.json({error:"NOT_FOUND",message:"School not found."},{status:404});return NextResponse.json({ok:true,result});}case"search":return NextResponse.json({results:await searchCrossSchool(session.adminId,session.role,input.q)});case"createPlan":if(session.role!=="super_admin")throw new ForbiddenError("Only a Super Admin can create platform plans.");return NextResponse.json({ok:true,result:await createPlan({adminId:session.adminId,adminRole:session.role,...input})},{status:201});case"assignPlan":await requireSchoolScope(session,input.schoolId);return NextResponse.json({ok:true,result:await assignPlan({adminId:session.adminId,adminRole:session.role,...input})});case"generateInvoice":{await requireSchoolScope(session,input.schoolId);const result=await hardenedGenerateInvoice(input.schoolId,input.period,session.adminId);if(!result)return NextResponse.json({error:"PLAN_REQUIRED",message:"Assign a subscription plan before generating an invoice."},{status:409});return NextResponse.json({ok:true,invoice:result,idempotent:result.existing},{status:result.existing?200:201});}case"recordPayment":{await requireSchoolScope(session,input.schoolId);const result=await hardenedRecordPayment(input.schoolId,input.invoiceId,input.amount,input.method,input.reference,session.adminId);if(!result)return NextResponse.json({error:"NOT_FOUND",message:"Platform invoice not found."},{status:404});if("duplicateReference" in result)return NextResponse.json({error:"DUPLICATE_REFERENCE",message:"That payment reference is already recorded for this school."},{status:409});return NextResponse.json({ok:true,reconciliation:result});}case"supportUpdate":await requireSchoolScope(session,input.schoolId);return NextResponse.json({ok:true,result:await updateSupportTicket({adminId:session.adminId,adminRole:session.role,...input})});case"impersonate":{await requireSchoolScope(session,input.schoolId);const result=await impersonatePlatformUser({adminId:session.adminId,adminRole:session.role,...input});const token=await createSchoolSessionToken({kind:"school",userId:result.userId,schoolId:input.schoolId,name:result.userName,impersonationId:result.id,impersonatedByAdminId:session.adminId},IMPERSONATION_SECONDS);const response=NextResponse.json({ok:true,result,expiresInSeconds:IMPERSONATION_SECONDS});response.cookies.set(SCHOOL_COOKIE,token,sessionCookieOptions(IMPERSONATION_SECONDS));return response;}}}catch(error){return routeError(error);}}