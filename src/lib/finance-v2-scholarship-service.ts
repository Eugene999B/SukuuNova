import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError, ForbiddenError } from "./errors";
import { requirePermission } from "./rbac";
import { decideFinanceAdjustment } from "./finance-service";

const D=(value:unknown)=>new Prisma.Decimal(String(value??0));
const money=(value:unknown)=>D(value).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);

type ChargeRow={id:string;invoiceId:string;originalAmount:Prisma.Decimal;scholarshipAmount:Prisma.Decimal;netAmount:Prisma.Decimal;paidAmount:Prisma.Decimal};
type AwardRow={id:string;studentId:string;termId:string;categoryId:string|null;status:string;createdBy:string;programName:string;sponsor:string|null;adjustmentId:string;adjustmentStatus:string;requestedBy:string;invoiceId:string;reduction:Prisma.Decimal};

async function scholarshipCharges(tx:TenantDb,schoolId:string,studentId:string,termId:string,categoryId:string|null,lock=false){
  return tx.$queryRawUnsafe<ChargeRow[]>(
    `SELECT ch."id",ch."invoiceId",ch."originalAmount",ch."scholarshipAmount",ch."netAmount",COALESCE((SELECT SUM(a."amount" * GREATEST(0,1-COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."schoolId"=a."schoolId" AND r."paymentId"=a."paymentId"),0)/NULLIF(p."amount",0))) FROM "FinancePaymentAllocation" a JOIN "Payment" p ON p."id"=a."paymentId" AND p."schoolId"=a."schoolId" WHERE a."schoolId"=ch."schoolId" AND a."chargeId"=ch."id"),0) AS "paidAmount" FROM "FinanceStudentCharge" ch WHERE ch."schoolId"=$1 AND ch."studentId"=$2 AND ch."termId"=$3 AND ($4::text IS NULL OR ch."categoryId"=$4) AND ch."status"<>'cancelled' ${lock?"FOR UPDATE OF ch":""}`,
    schoolId,studentId,termId,categoryId,
  );
}

function availableRelief(charges:ChargeRow[]){
  return charges.reduce((sum,charge)=>sum.plus(Prisma.Decimal.max(0,D(charge.netAmount).minus(D(charge.paidAmount)))),new Prisma.Decimal(0));
}

async function syncStatuses(tx:TenantDb,schoolId:string,invoiceId:string){
  await tx.$executeRawUnsafe(
    `UPDATE "FinanceStudentCharge" ch SET "status"=CASE WHEN ch."netAmount"<=0 THEN 'waived' WHEN COALESCE(x.paid,0)>=ch."netAmount" THEN 'paid' WHEN COALESCE(x.paid,0)>0 THEN 'partial' ELSE 'open' END,"updatedAt"=CURRENT_TIMESTAMP FROM (SELECT a."chargeId",SUM(a."amount" * GREATEST(0,1-COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."schoolId"=a."schoolId" AND r."paymentId"=a."paymentId"),0)/NULLIF(p."amount",0))) AS paid FROM "FinancePaymentAllocation" a JOIN "Payment" p ON p."id"=a."paymentId" AND p."schoolId"=a."schoolId" WHERE a."schoolId"=$1 GROUP BY a."chargeId") x WHERE ch."schoolId"=$1 AND ch."invoiceId"=$2 AND x."chargeId"=ch."id"`,
    schoolId,invoiceId,
  );
  await tx.$executeRawUnsafe(
    `UPDATE "FinanceStudentCharge" ch SET "status"=CASE WHEN ch."netAmount"<=0 THEN 'waived' ELSE 'open' END,"updatedAt"=CURRENT_TIMESTAMP WHERE ch."schoolId"=$1 AND ch."invoiceId"=$2 AND NOT EXISTS (SELECT 1 FROM "FinancePaymentAllocation" a WHERE a."schoolId"=ch."schoolId" AND a."chargeId"=ch."id")`,
    schoolId,invoiceId,
  );
}

export async function requestScholarshipV2(tx:TenantDb,input:{schoolId:string;actorId:string;programId:string;studentId:string;termId:string;categoryId?:string|null;mode:"percentage"|"fixed";value:number;capAmount?:number|null;note?:string|null}){
  await requirePermission(tx,input.actorId,"finance:scholarships_manage");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`scholarship:${input.schoolId}:${input.studentId}:${input.termId}`}))`;
  const programs=await tx.$queryRawUnsafe<Array<{id:string;name:string;sponsor:string|null}>>(`SELECT "id","name","sponsor" FROM "FinanceScholarshipProgram" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active'`,input.schoolId,input.programId);
  const program=programs[0];
  if(!program)throw new AppError("Scholarship programme not found.",404,"NOT_FOUND");
  const categoryId=input.categoryId?.trim()||null;
  const charges=await scholarshipCharges(tx,input.schoolId,input.studentId,input.termId,categoryId,true);
  if(!charges.length)throw new AppError("This learner has no matching published fee categories for the scholarship.",409,"NO_MATCHING_CHARGES");
  const invoiceIds=[...new Set(charges.map(charge=>charge.invoiceId))];
  if(invoiceIds.length!==1)throw new AppError("Scholarship charges must resolve to one term invoice.",409,"SCHOLARSHIP_INVOICE_MISMATCH");
  const requested=money(input.value);
  if(requested.lte(0)||(input.mode==="percentage"&&requested.gt(100)))throw new AppError("Enter a valid scholarship value.",400,"INVALID_SCHOLARSHIP");
  const basis=charges.reduce((sum,charge)=>sum.plus(D(charge.originalAmount)),new Prisma.Decimal(0));
  let reduction=input.mode==="percentage"?money(basis.mul(requested).div(100)):requested;
  const cap=input.capAmount==null?null:money(input.capAmount);
  if(cap&&reduction.gt(cap))reduction=cap;
  const available=availableRelief(charges);
  if(reduction.gt(available))reduction=available;
  if(reduction.lte(0))throw new AppError("These charges have no unpaid balance left for scholarship relief.",409,"SCHOLARSHIP_NO_BALANCE");

  const awardId=createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "FinanceScholarshipAward" ("id","schoolId","programId","studentId","termId","categoryId","mode","value","capAmount","status","note","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11)`,
    awardId,input.schoolId,input.programId,input.studentId,input.termId,categoryId,input.mode,requested,cap,input.note?.trim()||null,input.actorId,
  );
  const adjustmentId=createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "P3FinanceAdjustment" ("id","schoolId","studentId","invoiceId","termId","kind","mode","value","reason","status","requestedBy","fundingSource","fundingReference","createdAt","updatedAt","financeCategoryId","financeScholarshipAwardId") VALUES ($1,$2,$3,$4,$5,'scholarship','amount',$6,$7,'pending',$8,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$11,$12)`,
    adjustmentId,input.schoolId,input.studentId,invoiceIds[0],input.termId,reduction,input.note?.trim()||`Scholarship request: ${program.name}`,input.actorId,program.sponsor||program.name,awardId,categoryId,awardId,
  );
  await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"finance_v2.scholarship_requested",entityType:"FinanceScholarshipAward",entityId:awardId,after:{studentId:input.studentId,termId:input.termId,categoryId,reduction:reduction.toFixed(2),invoiceId:invoiceIds[0],status:"pending"}});
  return{id:awardId,reduction:reduction.toFixed(2),status:"pending"};
}

export async function decideScholarshipV2(tx:TenantDb,input:{schoolId:string;actorId:string;awardId:string;decision:"approve"|"reject"}){
  await requirePermission(tx,input.actorId,"finance:scholarships_approve");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`scholarship-decision:${input.schoolId}:${input.awardId}`}))`;
  const rows=await tx.$queryRawUnsafe<AwardRow[]>(
    `SELECT a."id",a."studentId",a."termId",a."categoryId",a."status",a."createdBy",p."name" AS "programName",p."sponsor",fa."id" AS "adjustmentId",fa."status" AS "adjustmentStatus",fa."requestedBy",fa."invoiceId",fa."value" AS reduction FROM "FinanceScholarshipAward" a JOIN "FinanceScholarshipProgram" p ON p."id"=a."programId" AND p."schoolId"=a."schoolId" JOIN "P3FinanceAdjustment" fa ON fa."financeScholarshipAwardId"=a."id" AND fa."schoolId"=a."schoolId" WHERE a."schoolId"=$1 AND a."id"=$2 FOR UPDATE OF a,fa`,
    input.schoolId,input.awardId,
  );
  const award=rows[0];
  if(!award)throw new AppError("Scholarship request not found.",404,"NOT_FOUND");
  if(award.status!=="pending"||award.adjustmentStatus!=="pending")throw new AppError("This scholarship request has already been decided.",409,"SCHOLARSHIP_CLOSED");
  if(award.requestedBy===input.actorId||award.createdBy===input.actorId)throw new ForbiddenError("The person who requested a scholarship cannot approve or reject the same request.");

  if(input.decision==="reject"){
    await decideFinanceAdjustment(tx,{schoolId:input.schoolId,actorId:input.actorId,adjustmentId:award.adjustmentId,decision:"reject"});
    await tx.$executeRawUnsafe(`UPDATE "FinanceScholarshipAward" SET "status"='rejected' WHERE "schoolId"=$1 AND "id"=$2`,input.schoolId,award.id);
    await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"finance_v2.scholarship_rejected",entityType:"FinanceScholarshipAward",entityId:award.id,before:{status:"pending"},after:{status:"rejected"}});
    return{id:award.id,status:"rejected"};
  }

  const charges=await scholarshipCharges(tx,input.schoolId,award.studentId,award.termId,award.categoryId,true);
  const reduction=money(award.reduction);
  const available=availableRelief(charges);
  if(available.lt(reduction))throw new AppError("The learner balance changed after this request. Review the scholarship amount and submit a new request.",409,"SCHOLARSHIP_BALANCE_CHANGED");
  await decideFinanceAdjustment(tx,{schoolId:input.schoolId,actorId:input.actorId,adjustmentId:award.adjustmentId,decision:"approve"});
  let left=reduction;
  for(const charge of charges){
    if(left.lte(0))break;
    const paid=D(charge.paidAmount);
    const availableOnCharge=Prisma.Decimal.max(0,D(charge.netAmount).minus(paid));
    const share=Prisma.Decimal.min(availableOnCharge,left);
    if(share.lte(0))continue;
    await tx.$executeRawUnsafe(`UPDATE "FinanceStudentCharge" SET "scholarshipAmount"="scholarshipAmount"+$1,"netAmount"=GREATEST(0,"netAmount"-$1),"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$2 AND "id"=$3`,share,input.schoolId,charge.id);
    left=left.minus(share);
  }
  if(left.gt(0))throw new AppError("Scholarship allocation could not be completed safely.",409,"SCHOLARSHIP_ALLOCATION_CHANGED");
  await tx.$executeRawUnsafe(`UPDATE "FinanceScholarshipAward" SET "status"='active' WHERE "schoolId"=$1 AND "id"=$2`,input.schoolId,award.id);
  await syncStatuses(tx,input.schoolId,award.invoiceId);
  await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"finance_v2.scholarship_approved",entityType:"FinanceScholarshipAward",entityId:award.id,before:{status:"pending"},after:{status:"active",reduction:reduction.toFixed(2),invoiceId:award.invoiceId}});
  return{id:award.id,status:"active",reduction:reduction.toFixed(2)};
}
