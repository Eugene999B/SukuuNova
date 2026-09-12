import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { hasPermission, requirePermission } from "./rbac";
import { refreshInvoiceFinancialProjection } from "./finance-service";

const D = (value: unknown) => new Prisma.Decimal(String(value ?? 0));
const money = (value: unknown) => D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

const DEFAULT_CATEGORIES = [
  ["TUITION","Tuition","tuition",true],
  ["TRANSPORT","Transport","transport",false],
  ["CANTEEN","Canteen / Meals","canteen",false],
  ["BOOKS","Books & Learning Materials","books",false],
  ["EXAM","Examinations","exam",true],
  ["BOARDING","Boarding","boarding",false],
  ["PTA","PTA / Development Levy","pta",false],
  ["ACTIVITY","Activities","activity",false],
  ["UNIFORM","Uniform","uniform",false],
  ["TECH","Technology","technology",false],
  ["OTHER","Other","other",false],
] as const;

export async function ensureDefaultFinanceCategories(tx: TenantDb, schoolId: string) {
  for (let index = 0; index < DEFAULT_CATEGORIES.length; index += 1) {
    const [code,name,kind,required] = DEFAULT_CATEGORIES[index];
    await tx.$executeRawUnsafe(
      `INSERT INTO "FinanceFeeCategory" ("id","schoolId","code","name","kind","required","active","sortOrder") VALUES ($1,$2,$3,$4,$5,$6,true,$7) ON CONFLICT ("schoolId","code") DO NOTHING`,
      createId(), schoolId, code, name, kind, required, index,
    );
  }
}

export async function financeV2Snapshot(tx: TenantDb, schoolId: string, actorId: string) {
  await requirePermission(tx, actorId, "finance:read");
  await ensureDefaultFinanceCategories(tx, schoolId);
  const [categories, structures, structureLines, students, terms, classes, charges, expenses, programs, awards, recentPayments] = await Promise.all([
    tx.$queryRawUnsafe<any[]>(`SELECT * FROM "FinanceFeeCategory" WHERE "schoolId"=$1 ORDER BY "sortOrder","name"`, schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT fs.*,c."name" AS "className",t."name" AS "termName",ay."name" AS "academicYearName" FROM "FinanceFeeStructure" fs JOIN "Class" c ON c."id"=fs."classId" AND c."schoolId"=fs."schoolId" JOIN "Term" t ON t."id"=fs."termId" AND t."schoolId"=fs."schoolId" JOIN "AcademicYear" ay ON ay."id"=t."academicYearId" AND ay."schoolId"=t."schoolId" WHERE fs."schoolId"=$1 ORDER BY fs."createdAt" DESC`, schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT l.*,fc."name" AS "categoryName",fc."code" AS "categoryCode" FROM "FinanceFeeStructureLine" l JOIN "FinanceFeeCategory" fc ON fc."id"=l."categoryId" AND fc."schoolId"=l."schoolId" WHERE l."schoolId"=$1 ORDER BY l."sortOrder",fc."name"`, schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT s."id",s."name",s."admissionNo",s."classId",c."name" AS "className" FROM "Student" s LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=s."schoolId" WHERE s."schoolId"=$1 AND s."status"='active' ORDER BY s."name"`, schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT t."id",t."name",t."academicYearId",t."isLocked",ay."name" AS "academicYearName" FROM "Term" t JOIN "AcademicYear" ay ON ay."id"=t."academicYearId" AND ay."schoolId"=t."schoolId" WHERE t."schoolId"=$1 ORDER BY ay."startDate" DESC,t."startDate" DESC`, schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT "id","name" FROM "Class" WHERE "schoolId"=$1 ORDER BY "name"`, schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT ch.*,s."name" AS "studentName",s."admissionNo",fc."name" AS "categoryName",COALESCE((SELECT SUM(a."amount" * GREATEST(0,1-COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."schoolId"=a."schoolId" AND r."paymentId"=a."paymentId"),0)/NULLIF(p."amount",0))) FROM "FinancePaymentAllocation" a JOIN "Payment" p ON p."id"=a."paymentId" AND p."schoolId"=a."schoolId" WHERE a."schoolId"=ch."schoolId" AND a."chargeId"=ch."id"),0) AS "paidAmount" FROM "FinanceStudentCharge" ch JOIN "Student" s ON s."id"=ch."studentId" AND s."schoolId"=ch."schoolId" JOIN "FinanceFeeCategory" fc ON fc."id"=ch."categoryId" AND fc."schoolId"=ch."schoolId" WHERE ch."schoolId"=$1 ORDER BY ch."createdAt" DESC`, schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT e.*,u."name" AS "enteredByName",a."name" AS "approvedByName" FROM "FinanceExpense" e JOIN "User" u ON u."id"=e."enteredBy" AND u."schoolId"=e."schoolId" LEFT JOIN "User" a ON a."id"=e."approvedBy" AND a."schoolId"=e."schoolId" WHERE e."schoolId"=$1 ORDER BY e."expenseDate" DESC,e."createdAt" DESC LIMIT 1000`, schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT * FROM "FinanceScholarshipProgram" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC`, schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT a.*,p."name" AS "programName",s."name" AS "studentName",fc."name" AS "categoryName" FROM "FinanceScholarshipAward" a JOIN "FinanceScholarshipProgram" p ON p."id"=a."programId" AND p."schoolId"=a."schoolId" JOIN "Student" s ON s."id"=a."studentId" AND s."schoolId"=a."schoolId" LEFT JOIN "FinanceFeeCategory" fc ON fc."id"=a."categoryId" AND fc."schoolId"=a."schoolId" WHERE a."schoolId"=$1 ORDER BY a."createdAt" DESC`, schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT p."id",p."invoiceId",p."amount",p."method",p."reference",p."createdAt",i."studentId",s."name" AS "studentName",COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."schoolId"=p."schoolId" AND r."paymentId"=p."id"),0) AS "reversedAmount" FROM "Payment" p JOIN "Invoice" i ON i."id"=p."invoiceId" AND i."schoolId"=p."schoolId" JOIN "Student" s ON s."id"=i."studentId" AND s."schoolId"=i."schoolId" WHERE p."schoolId"=$1 ORDER BY p."createdAt" DESC LIMIT 500`, schoolId),
  ]);
  const capabilities = {
    canManageFees: await hasPermission(tx, actorId, "finance:fee_structures_manage"),
    canRecordPayment: await hasPermission(tx, actorId, "payments:record"),
    canReversePayment: await hasPermission(tx, actorId, "payments:reverse"),
    canManageScholarships: await hasPermission(tx, actorId, "finance:scholarships_manage"),
    canRecordExpense: await hasPermission(tx, actorId, "finance:expenses_write"),
    canApproveExpense: await hasPermission(tx, actorId, "finance:expenses_approve"),
    canExport: await hasPermission(tx, actorId, "finance:export"),
  };
  return { categories, structures, structureLines, students, terms, classes, charges, expenses, programs, awards, recentPayments, capabilities };
}

export async function createFinanceCategory(tx: TenantDb, input: {schoolId:string;actorId:string;name:string;code:string;kind:string;required:boolean}) {
  await requirePermission(tx,input.actorId,"finance:fee_structures_manage");
  const id=createId(); const name=input.name.trim(); const code=input.code.trim().toUpperCase().replace(/[^A-Z0-9_]+/g,"_");
  if(name.length<2||!code) throw new AppError("Category name and code are required.",400,"INVALID_FEE_CATEGORY");
  await tx.$executeRawUnsafe(`INSERT INTO "FinanceFeeCategory" ("id","schoolId","code","name","kind","required") VALUES ($1,$2,$3,$4,$5,$6)`,id,input.schoolId,code,name,input.kind,input.required);
  await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"finance_v2.fee_category_created",entityType:"FinanceFeeCategory",entityId:id,after:{code,name,kind:input.kind,required:input.required}});
  return {id};
}

export async function createFeeStructureV2(tx: TenantDb, input: {schoolId:string;actorId:string;termId:string;classId:string;name:string;lines:Array<{categoryId:string;amount:number;dueDate?:string|null;optional?:boolean}>}) {
  await requirePermission(tx,input.actorId,"finance:fee_structures_manage");
  if(!input.lines.length) throw new AppError("Add at least one fee category to the structure.",400,"FEE_LINES_REQUIRED");
  const term=await tx.term.findFirst({where:{id:input.termId,schoolId:input.schoolId},select:{id:true,isLocked:true}});
  if(!term) throw new AppError("Term not found.",404,"TERM_NOT_FOUND");
  if(term.isLocked) throw new AppError("Locked terms cannot receive a fee structure.",409,"TERM_LOCKED");
  const klass=await tx.class.findFirst({where:{id:input.classId,schoolId:input.schoolId},select:{id:true}});
  if(!klass) throw new AppError("Class not found.",404,"CLASS_NOT_FOUND");
  const categories=await tx.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "FinanceFeeCategory" WHERE "schoolId"=$1 AND "id"=ANY($2::text[]) AND "active"=true`,input.schoolId,input.lines.map(x=>x.categoryId));
  if(categories.length!==new Set(input.lines.map(x=>x.categoryId)).size) throw new AppError("One or more selected fee categories are invalid.",400,"INVALID_FEE_CATEGORY");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fee-structure:${input.schoolId}:${input.termId}:${input.classId}`}))`;
  const versionRows=await tx.$queryRawUnsafe<Array<{version:number}>>(`SELECT COALESCE(MAX("version"),0)+1 AS "version" FROM "FinanceFeeStructure" WHERE "schoolId"=$1 AND "termId"=$2 AND "classId"=$3`,input.schoolId,input.termId,input.classId);
  const version=Number(versionRows[0]?.version||1); const structureId=createId();
  await tx.$executeRawUnsafe(`INSERT INTO "FinanceFeeStructure" ("id","schoolId","termId","classId","name","version","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7)`,structureId,input.schoolId,input.termId,input.classId,input.name.trim()||`Fee Structure v${version}`,version,input.actorId);
  for(let index=0;index<input.lines.length;index+=1){const line=input.lines[index];const amount=money(line.amount);if(amount.lt(0))throw new AppError("Fee amounts cannot be negative.",400,"INVALID_AMOUNT");await tx.$executeRawUnsafe(`INSERT INTO "FinanceFeeStructureLine" ("id","schoolId","structureId","categoryId","amount","dueDate","optional","sortOrder") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,createId(),input.schoolId,structureId,line.categoryId,amount,line.dueDate?new Date(line.dueDate):null,Boolean(line.optional),index);}
  await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"finance_v2.fee_structure_created",entityType:"FinanceFeeStructure",entityId:structureId,after:{termId:input.termId,classId:input.classId,version,lineCount:input.lines.length}});
  return {id:structureId,version};
}

type PublishLine={id:string;categoryId:string;amount:Prisma.Decimal;dueDate:Date|null;optional:boolean;categoryName:string;categoryCode:string};
export async function publishFeeStructureV2(tx: TenantDb,input:{schoolId:string;actorId:string;structureId:string}){
  await requirePermission(tx,input.actorId,"finance:fee_structures_manage");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`publish-fees:${input.schoolId}:${input.structureId}`}))`;
  const structures=await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "FinanceFeeStructure" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`,input.schoolId,input.structureId);const structure=structures[0];
  if(!structure)throw new AppError("Fee structure not found.",404,"NOT_FOUND");
  if(structure.status==='published')return {id:structure.id,alreadyPublished:true};
  if(structure.status!=='draft')throw new AppError("Only a draft fee structure can be published.",409,"STRUCTURE_NOT_DRAFT");
  const term=await tx.term.findFirst({where:{id:structure.termId,schoolId:input.schoolId},select:{isLocked:true}});if(!term||term.isLocked)throw new AppError("The selected term is locked or unavailable.",409,"TERM_LOCKED");
  const lines=await tx.$queryRawUnsafe<PublishLine[]>(`SELECT l."id",l."categoryId",l."amount",l."dueDate",l."optional",c."name" AS "categoryName",c."code" AS "categoryCode" FROM "FinanceFeeStructureLine" l JOIN "FinanceFeeCategory" c ON c."id"=l."categoryId" AND c."schoolId"=l."schoolId" WHERE l."schoolId"=$1 AND l."structureId"=$2 ORDER BY l."sortOrder"`,input.schoolId,input.structureId);
  if(!lines.length)throw new AppError("The fee structure has no lines.",409,"FEE_LINES_REQUIRED");
  const students=await tx.student.findMany({where:{schoolId:input.schoolId,classId:structure.classId,status:'active'},select:{id:true}});
  let assigned=0;
  for(const student of students){
    let invoice=await tx.invoice.findFirst({where:{schoolId:input.schoolId,studentId:student.id,termId:structure.termId},select:{id:true}});
    if(!invoice){invoice=await tx.invoice.create({data:{schoolId:input.schoolId,studentId:student.id,termId:structure.termId,totalAmount:new Prisma.Decimal(0),status:'unpaid'},select:{id:true}});}
    for(const line of lines){
      if(line.optional) continue;
      const feeName=`${line.categoryName} · ${structure.name}`;
      const items=await tx.$queryRawUnsafe<Array<{id:string}>>(`INSERT INTO "FeeItem" ("id","schoolId","name","amount","termId","classId") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("schoolId","termId","classId","name") DO UPDATE SET "amount"=EXCLUDED."amount" RETURNING "id"`,createId(),input.schoolId,feeName,line.amount,structure.termId,structure.classId);
      const feeItemId=items[0]?.id;if(!feeItemId)throw new AppError("Fee item could not be materialized.",500,"FEE_ITEM_CREATE_FAILED");
      await tx.$executeRawUnsafe(`INSERT INTO "InvoiceLine" ("schoolId","invoiceId","feeItemId","amount") VALUES ($1,$2,$3,$4) ON CONFLICT ("invoiceId","feeItemId") DO UPDATE SET "amount"=EXCLUDED."amount"`,input.schoolId,invoice.id,feeItemId,line.amount);
      await tx.$executeRawUnsafe(`INSERT INTO "FinanceStudentCharge" ("id","schoolId","studentId","termId","structureId","structureLineId","categoryId","invoiceId","feeItemId","originalAmount","netAmount","dueDate") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11) ON CONFLICT ("schoolId","studentId","structureLineId") DO NOTHING`,createId(),input.schoolId,student.id,structure.termId,structure.id,line.id,line.categoryId,invoice.id,feeItemId,line.amount,line.dueDate);
      assigned+=1;
    }
    await tx.$executeRawUnsafe(`UPDATE "Invoice" i SET "totalAmount"=(SELECT COALESCE(SUM(il."amount"),0) FROM "InvoiceLine" il WHERE il."schoolId"=i."schoolId" AND il."invoiceId"=i."id") WHERE i."schoolId"=$1 AND i."id"=$2`,input.schoolId,invoice.id);
    await refreshInvoiceFinancialProjection(tx,input.schoolId,invoice.id);
  }
  await tx.$executeRawUnsafe(`UPDATE "FinanceFeeStructure" SET "status"='published',"publishedAt"=CURRENT_TIMESTAMP,"publishedBy"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$2 AND "id"=$3`,input.actorId,input.schoolId,input.structureId);
  await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"finance_v2.fee_structure_published",entityType:"FinanceFeeStructure",entityId:input.structureId,after:{students:students.length,charges:assigned}});
  return {id:input.structureId,students:students.length,charges:assigned};
}

export async function recordAllocatedPaymentV2(tx: TenantDb,input:{schoolId:string;actorId:string;studentId:string;invoiceId:string;method:string;reference?:string|null;allocations:Array<{chargeId:string;amount:number}>}){
  await requirePermission(tx,input.actorId,"payments:record");
  if(!input.allocations.length)throw new AppError("Choose at least one fee category to pay.",400,"PAYMENT_ALLOCATION_REQUIRED");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment:${input.schoolId}:${input.invoiceId}`}))`;
  const invoice=await tx.invoice.findFirst({where:{id:input.invoiceId,schoolId:input.schoolId},select:{id:true,studentId:true,totalAmount:true}});if(!invoice||invoice.studentId!==input.studentId)throw new AppError("Invoice not found for this learner.",404,"NOT_FOUND");
  const chargeIds=input.allocations.map(a=>a.chargeId);const charges=await tx.$queryRawUnsafe<any[]>(`SELECT ch."id",ch."invoiceId",ch."netAmount",COALESCE((SELECT SUM(a."amount" * GREATEST(0,1-COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."schoolId"=a."schoolId" AND r."paymentId"=a."paymentId"),0)/NULLIF(p."amount",0))) FROM "FinancePaymentAllocation" a JOIN "Payment" p ON p."id"=a."paymentId" AND p."schoolId"=a."schoolId" WHERE a."schoolId"=ch."schoolId" AND a."chargeId"=ch."id"),0) AS "paidAmount" FROM "FinanceStudentCharge" ch WHERE ch."schoolId"=$1 AND ch."id"=ANY($2::text[]) FOR UPDATE`,input.schoolId,chargeIds);
  if(charges.length!==new Set(chargeIds).size||charges.some(c=>c.invoiceId!==input.invoiceId))throw new AppError("One or more selected fee categories are invalid for this invoice.",400,"INVALID_ALLOCATION");
  let total=new Prisma.Decimal(0);const normalized:Array<{chargeId:string;amount:Prisma.Decimal}>=[];
  for(const requested of input.allocations){const charge=charges.find(c=>c.id===requested.chargeId);const amount=money(requested.amount);if(amount.lte(0))throw new AppError("Payment amounts must be greater than zero.",400,"INVALID_AMOUNT");const remaining=D(charge.netAmount).minus(D(charge.paidAmount));if(amount.gt(remaining))throw new AppError("A category payment cannot exceed its remaining balance.",409,"PAYMENT_EXCEEDS_CATEGORY_BALANCE");total=total.plus(amount);normalized.push({chargeId:requested.chargeId,amount});}
  const payment=await tx.payment.create({data:{schoolId:input.schoolId,invoiceId:input.invoiceId,amount:total,method:input.method,reference:input.reference?.trim()||null},select:{id:true,amount:true,createdAt:true}});
  for(const allocation of normalized){await tx.$executeRawUnsafe(`INSERT INTO "FinancePaymentAllocation" ("id","schoolId","paymentId","chargeId","amount") VALUES ($1,$2,$3,$4,$5)`,createId(),input.schoolId,payment.id,allocation.chargeId,allocation.amount);}
  await syncChargeStatuses(tx,input.schoolId,input.invoiceId);
  await refreshInvoiceFinancialProjection(tx,input.schoolId,input.invoiceId);
  await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"finance_v2.payment_recorded",entityType:"Payment",entityId:payment.id,after:{studentId:input.studentId,invoiceId:input.invoiceId,amount:total.toFixed(2),method:input.method,allocations:normalized.map(a=>({chargeId:a.chargeId,amount:a.amount.toFixed(2)}))}});
  return payment;
}

async function syncChargeStatuses(tx:TenantDb,schoolId:string,invoiceId:string){await tx.$executeRawUnsafe(`UPDATE "FinanceStudentCharge" ch SET "status"=CASE WHEN ch."netAmount"<=0 THEN 'waived' WHEN COALESCE(x.paid,0)>=ch."netAmount" THEN 'paid' WHEN COALESCE(x.paid,0)>0 THEN 'partial' ELSE 'open' END,"updatedAt"=CURRENT_TIMESTAMP FROM (SELECT a."chargeId",SUM(a."amount" * GREATEST(0,1-COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."schoolId"=a."schoolId" AND r."paymentId"=a."paymentId"),0)/NULLIF(p."amount",0))) AS paid FROM "FinancePaymentAllocation" a JOIN "Payment" p ON p."id"=a."paymentId" AND p."schoolId"=a."schoolId" WHERE a."schoolId"=$1 GROUP BY a."chargeId") x WHERE ch."schoolId"=$1 AND ch."invoiceId"=$2 AND x."chargeId"=ch."id"`,schoolId,invoiceId);await tx.$executeRawUnsafe(`UPDATE "FinanceStudentCharge" ch SET "status"=CASE WHEN ch."netAmount"<=0 THEN 'waived' ELSE 'open' END,"updatedAt"=CURRENT_TIMESTAMP WHERE ch."schoolId"=$1 AND ch."invoiceId"=$2 AND NOT EXISTS (SELECT 1 FROM "FinancePaymentAllocation" a WHERE a."schoolId"=ch."schoolId" AND a."chargeId"=ch."id")`,schoolId,invoiceId);}

export async function createScholarshipProgramV2(tx:TenantDb,input:{schoolId:string;actorId:string;name:string;sponsor?:string|null;reason?:string|null}){await requirePermission(tx,input.actorId,"finance:scholarships_manage");const id=createId();await tx.$executeRawUnsafe(`INSERT INTO "FinanceScholarshipProgram" ("id","schoolId","name","sponsor","reason","createdBy") VALUES ($1,$2,$3,$4,$5,$6)`,id,input.schoolId,input.name.trim(),input.sponsor?.trim()||null,input.reason?.trim()||null,input.actorId);await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"finance_v2.scholarship_program_created",entityType:"FinanceScholarshipProgram",entityId:id,after:{name:input.name,sponsor:input.sponsor}});return{id};}

export async function awardScholarshipV2(tx:TenantDb,input:{schoolId:string;actorId:string;programId:string;studentId:string;termId:string;categoryId?:string|null;mode:'percentage'|'fixed';value:number;capAmount?:number|null;note?:string|null}){
  await requirePermission(tx,input.actorId,"finance:scholarships_manage");await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`scholarship:${input.schoolId}:${input.studentId}:${input.termId}`}))`;
  const programs=await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "FinanceScholarshipProgram" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='active'`,input.schoolId,input.programId);if(!programs[0])throw new AppError("Scholarship programme not found.",404,"NOT_FOUND");
  const charges=await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "FinanceStudentCharge" WHERE "schoolId"=$1 AND "studentId"=$2 AND "termId"=$3 AND ($4::text IS NULL OR "categoryId"=$4) AND "status"<>'cancelled' FOR UPDATE`,input.schoolId,input.studentId,input.termId,input.categoryId||null);if(!charges.length)throw new AppError("This learner has no matching published fee categories for the scholarship.",409,"NO_MATCHING_CHARGES");
  const requested=money(input.value);if(requested.lte(0)||(input.mode==='percentage'&&requested.gt(100)))throw new AppError("Enter a valid scholarship value.",400,"INVALID_SCHOLARSHIP");
  let reduction=input.mode==='percentage'?charges.reduce((sum,c)=>sum.plus(D(c.originalAmount).mul(requested).div(100)),new Prisma.Decimal(0)):requested;const cap=input.capAmount==null?null:money(input.capAmount);if(cap&&reduction.gt(cap))reduction=cap;const remainingGross=charges.reduce((sum,c)=>sum.plus(D(c.originalAmount).minus(D(c.scholarshipAmount))),new Prisma.Decimal(0));if(reduction.gt(remainingGross))reduction=remainingGross;if(reduction.lte(0))throw new AppError("These charges are already fully covered.",409,"SCHOLARSHIP_NO_BALANCE");
  const awardId=createId();await tx.$executeRawUnsafe(`INSERT INTO "FinanceScholarshipAward" ("id","schoolId","programId","studentId","termId","categoryId","mode","value","capAmount","note","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,awardId,input.schoolId,input.programId,input.studentId,input.termId,input.categoryId||null,input.mode,requested,cap,input.note?.trim()||null,input.actorId);
  const invoiceIds=[...new Set(charges.map(c=>String(c.invoiceId)))];if(invoiceIds.length!==1)throw new AppError("Scholarship charges must resolve to one term invoice.",409,"SCHOLARSHIP_INVOICE_MISMATCH");const invoiceId=invoiceIds[0];
  const adjustmentId=createId();await tx.$executeRawUnsafe(`INSERT INTO "P3FinanceAdjustment" ("id","schoolId","studentId","invoiceId","termId","kind","mode","value","reason","status","requestedBy","approvedBy","approvedAt","fundingSource","fundingReference","createdAt","updatedAt","financeCategoryId","financeScholarshipAwardId") VALUES ($1,$2,$3,$4,$5,'scholarship','amount',$6,$7,'approved',$8,$8,CURRENT_TIMESTAMP,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$11,$12)`,adjustmentId,input.schoolId,input.studentId,invoiceId,input.termId,reduction,input.note?.trim()||`Scholarship: ${programs[0].name}`,input.actorId,programs[0].sponsor||programs[0].name,awardId,input.categoryId||null,awardId);
  let left=reduction;for(const charge of charges){if(left.lte(0))break;const available=D(charge.originalAmount).minus(D(charge.scholarshipAmount));const share=Prisma.Decimal.min(available,left);await tx.$executeRawUnsafe(`UPDATE "FinanceStudentCharge" SET "scholarshipAmount"="scholarshipAmount"+$1,"netAmount"=GREATEST(0,"netAmount"-$1),"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$2 AND "id"=$3`,share,input.schoolId,charge.id);left=left.minus(share);}
  await refreshInvoiceFinancialProjection(tx,input.schoolId,invoiceId);await syncChargeStatuses(tx,input.schoolId,invoiceId);await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"finance_v2.scholarship_awarded",entityType:"FinanceScholarshipAward",entityId:awardId,after:{studentId:input.studentId,termId:input.termId,categoryId:input.categoryId||null,reduction:reduction.toFixed(2),invoiceId}});return{id:awardId,reduction:reduction.toFixed(2)};
}

export async function createExpenseV2(tx:TenantDb,input:{schoolId:string;actorId:string;expenseDate:string;category:string;vendor:string;amount:number;paymentMethod:string;reference?:string|null;description?:string|null;evidenceUrl?:string|null}){await requirePermission(tx,input.actorId,"finance:expenses_write");const amount=money(input.amount);if(amount.lte(0))throw new AppError("Expense amount must be greater than zero.",400,"INVALID_AMOUNT");const id=createId();await tx.$executeRawUnsafe(`INSERT INTO "FinanceExpense" ("id","schoolId","expenseDate","category","vendor","amount","paymentMethod","reference","description","evidenceUrl","enteredBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,id,input.schoolId,new Date(input.expenseDate),input.category,input.vendor.trim(),amount,input.paymentMethod,input.reference?.trim()||null,input.description?.trim()||null,input.evidenceUrl?.trim()||null,input.actorId);await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"finance_v2.expense_recorded",entityType:"FinanceExpense",entityId:id,after:{category:input.category,vendor:input.vendor,amount:amount.toFixed(2),date:input.expenseDate}});return{id};}

export async function decideExpenseV2(tx:TenantDb,input:{schoolId:string;actorId:string;expenseId:string;decision:'approve'|'reverse';reason?:string|null}){await requirePermission(tx,input.actorId,"finance:expenses_approve");const rows=await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "FinanceExpense" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`,input.schoolId,input.expenseId);const expense=rows[0];if(!expense)throw new AppError("Expense not found.",404,"NOT_FOUND");if(input.decision==='approve'){if(expense.status!=='recorded')throw new AppError("Only recorded expenses can be approved.",409,"EXPENSE_CLOSED");if(expense.enteredBy===input.actorId)throw new AppError("The person who entered an expense cannot approve the same expense.",403,"SELF_APPROVAL_BLOCKED");await tx.$executeRawUnsafe(`UPDATE "FinanceExpense" SET "status"='approved',"approvedBy"=$1,"approvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$2 AND "id"=$3`,input.actorId,input.schoolId,input.expenseId);}else{if(expense.status==='reversed')throw new AppError("Expense is already reversed.",409,"EXPENSE_CLOSED");if(!input.reason?.trim())throw new AppError("A reversal reason is required.",400,"REVERSAL_REASON_REQUIRED");await tx.$executeRawUnsafe(`UPDATE "FinanceExpense" SET "status"='reversed',"reversedBy"=$1,"reversedAt"=CURRENT_TIMESTAMP,"reversalReason"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$3 AND "id"=$4`,input.actorId,input.reason.trim(),input.schoolId,input.expenseId);}await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:`finance_v2.expense_${input.decision==='approve'?'approved':'reversed'}`,entityType:"FinanceExpense",entityId:input.expenseId,before:{status:expense.status},after:{status:input.decision==='approve'?'approved':'reversed',reason:input.reason||null}});return{id:input.expenseId};}
