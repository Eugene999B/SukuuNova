import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { hasPermission, requirePermission } from "./rbac";

const D=(value:unknown)=>new Prisma.Decimal(String(value??0));
const money=(value:unknown)=>D(value).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);

type ComponentInput={name:string;componentType:'earning'|'allowance'|'benefit'|'deduction'|'tax'|'employer_contribution';calculationType:'fixed'|'percentage';value:number;taxable?:boolean;pensionable?:boolean;employerOnly?:boolean};
type ComponentRow={id:string;name:string;componentType:ComponentInput['componentType'];calculationType:ComponentInput['calculationType'];value:Prisma.Decimal;taxable:boolean;pensionable:boolean;employerOnly:boolean;sortOrder:number};

function resolveComponents(components:ComponentRow[]){
  const basic=components.find(c=>c.componentType==='earning'&&c.name.trim().toLowerCase()==='basic salary')??components.find(c=>c.componentType==='earning');
  const base=basic?money(basic.value):new Prisma.Decimal(0);
  const rows=components.map(component=>{const amount=component.calculationType==='percentage'?money(base.mul(component.value).div(100)):money(component.value);return{...component,amount};});
  const earnings=rows.filter(r=>!r.employerOnly&&['earning','allowance','benefit'].includes(r.componentType)).reduce((s,r)=>s.plus(r.amount),new Prisma.Decimal(0));
  const deductions=rows.filter(r=>!r.employerOnly&&['deduction','tax'].includes(r.componentType)).reduce((s,r)=>s.plus(r.amount),new Prisma.Decimal(0));
  const taxes=rows.filter(r=>!r.employerOnly&&r.componentType==='tax').reduce((s,r)=>s.plus(r.amount),new Prisma.Decimal(0));
  const employer=rows.filter(r=>r.employerOnly||r.componentType==='employer_contribution').reduce((s,r)=>s.plus(r.amount),new Prisma.Decimal(0));
  const net=earnings.minus(deductions);
  if(net.lt(0))throw new AppError("Salary deductions cannot exceed employee earnings.",409,"NEGATIVE_NET_PAY");
  return{rows,earnings:money(earnings),deductions:money(deductions),taxes:money(taxes),employer:money(employer),net:money(net)};
}

export async function payrollV2Snapshot(tx:TenantDb,schoolId:string,actorId:string){
  await requirePermission(tx,actorId,"payroll:view_all");
  const [staff,structures,components,runs,payslips]=await Promise.all([
    tx.$queryRawUnsafe<any[]>(`SELECT u."id",u."name",u."email",u."phone",COALESCE(string_agg(DISTINCT r."name",', '),'Staff') AS "roles" FROM "User" u LEFT JOIN "UserRole" ur ON ur."userId"=u."id" AND ur."schoolId"=u."schoolId" LEFT JOIN "Role" r ON r."id"=ur."roleId" AND r."schoolId"=ur."schoolId" WHERE u."schoolId"=$1 AND u."status"='active' GROUP BY u."id" ORDER BY u."name"`,schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT ss."id",ss."staffId",ss."grossSalary",ss."effectiveFrom",ss."status",ss."updatedAt",u."name" AS "staffName" FROM "SalaryStructure" ss JOIN "User" u ON u."id"=ss."staffId" AND u."schoolId"=ss."schoolId" WHERE ss."schoolId"=$1 ORDER BY u."name"`,schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT * FROM "PayrollSalaryComponent" WHERE "schoolId"=$1 ORDER BY "salaryStructureId","sortOrder"`,schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT pr.*,u."name" AS "createdByName",a."name" AS "approvedByName" FROM "PayrollRun" pr LEFT JOIN "User" u ON u."id"=pr."createdBy" AND u."schoolId"=pr."schoolId" LEFT JOIN "User" a ON a."id"=pr."approvedBy" AND a."schoolId"=pr."schoolId" WHERE pr."schoolId"=$1 ORDER BY pr."period" DESC LIMIT 36`,schoolId),
    tx.$queryRawUnsafe<any[]>(`SELECT ps."id",ps."payrollRunId",ps."staffId",ps."gross",ps."net",ps."earningsTotal",ps."deductionsTotal",ps."taxTotal",ps."employerContributionTotal",ps."status",ps."paidAt",ps."paymentReference",ps."componentSnapshot",u."name" AS "staffName" FROM "Payslip" ps JOIN "User" u ON u."id"=ps."staffId" AND u."schoolId"=ps."schoolId" WHERE ps."schoolId"=$1 ORDER BY ps."createdAt" DESC LIMIT 1000`,schoolId),
  ]);
  return{staff,structures,components,runs,payslips,capabilities:{canManageSalary:await hasPermission(tx,actorId,"payroll:salary_manage"),canRun:await hasPermission(tx,actorId,"payroll:run"),canMarkPaid:await hasPermission(tx,actorId,"payroll:mark_paid"),canExport:await hasPermission(tx,actorId,"finance:export")}};
}

export async function saveSalaryStructureV2(tx:TenantDb,input:{schoolId:string;actorId:string;staffId:string;effectiveFrom:string;components:ComponentInput[]}){
  await requirePermission(tx,input.actorId,"payroll:salary_manage");
  if(!input.components.length)throw new AppError("Add at least one salary component.",400,"SALARY_COMPONENTS_REQUIRED");
  const staff=await tx.user.findFirst({where:{id:input.staffId,schoolId:input.schoolId,status:'active'},select:{id:true,name:true}});if(!staff)throw new AppError("Staff member not found.",404,"NOT_FOUND");
  const normalized:ComponentRow[]=input.components.map((c,index)=>({id:createId(),name:c.name.trim(),componentType:c.componentType,calculationType:c.calculationType,value:money(c.value),taxable:Boolean(c.taxable),pensionable:Boolean(c.pensionable),employerOnly:Boolean(c.employerOnly),sortOrder:index}));
  if(normalized.some(c=>!c.name||c.value.lt(0)))throw new AppError("Every salary component needs a name and non-negative value.",400,"INVALID_SALARY_COMPONENT");
  const result=resolveComponents(normalized);await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`salary:${input.schoolId}:${input.staffId}`}))`;
  const existing=await tx.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "SalaryStructure" WHERE "schoolId"=$1 AND "staffId"=$2 FOR UPDATE`,input.schoolId,input.staffId);const structureId=existing[0]?.id??createId();
  if(existing[0])await tx.$executeRawUnsafe(`UPDATE "SalaryStructure" SET "grossSalary"=$1,"deductions"=$2::jsonb,"effectiveFrom"=$3,"status"='active',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$4 AND "id"=$5`,result.earnings,JSON.stringify({total:result.deductions.toFixed(2)}),new Date(input.effectiveFrom),input.schoolId,structureId);else await tx.$executeRawUnsafe(`INSERT INTO "SalaryStructure" ("id","schoolId","staffId","grossSalary","deductions","effectiveFrom","status","updatedAt") VALUES ($1,$2,$3,$4,$5::jsonb,$6,'active',CURRENT_TIMESTAMP)`,structureId,input.schoolId,input.staffId,result.earnings,JSON.stringify({total:result.deductions.toFixed(2)}),new Date(input.effectiveFrom));
  await tx.$executeRawUnsafe(`DELETE FROM "PayrollSalaryComponent" WHERE "schoolId"=$1 AND "salaryStructureId"=$2`,input.schoolId,structureId);
  for(const c of normalized)await tx.$executeRawUnsafe(`INSERT INTO "PayrollSalaryComponent" ("id","schoolId","salaryStructureId","name","componentType","calculationType","value","taxable","pensionable","employerOnly","sortOrder") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,c.id,input.schoolId,structureId,c.name,c.componentType,c.calculationType,c.value,c.taxable,c.pensionable,c.employerOnly,c.sortOrder);
  await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"payroll_v2.salary_structure_saved",entityType:"SalaryStructure",entityId:structureId,after:{staffId:input.staffId,effectiveFrom:input.effectiveFrom,earnings:result.earnings.toFixed(2),deductions:result.deductions.toFixed(2),net:result.net.toFixed(2),components:normalized.map(c=>({name:c.name,type:c.componentType,calculation:c.calculationType,value:c.value.toFixed(2)}))}});return{id:structureId,net:result.net.toFixed(2)};
}

export async function runPayrollV2(tx:TenantDb,input:{schoolId:string;actorId:string;period:string;staffIds?:string[]}){
  await requirePermission(tx,input.actorId,"payroll:run");if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period))throw new AppError("Payroll period must be YYYY-MM.",400,"INVALID_PAYROLL_PERIOD");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payroll:${input.schoolId}:${input.period}`}))`;
  const existing=await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "PayrollRun" WHERE "schoolId"=$1 AND "period"=$2 FOR UPDATE`,input.schoolId,input.period);if(existing[0]&&existing[0].status!=='draft')throw new AppError("This payroll period has already been processed.",409,"PAYROLL_ALREADY_PROCESSED");
  const runId=existing[0]?.id??createId();if(!existing[0])await tx.$executeRawUnsafe(`INSERT INTO "PayrollRun" ("id","schoolId","period","status","createdBy") VALUES ($1,$2,$3,'draft',$4)`,runId,input.schoolId,input.period,input.actorId);
  const selected=input.staffIds?.filter(Boolean)??[];const structures=await tx.$queryRawUnsafe<any[]>(`SELECT ss."id",ss."staffId",ss."effectiveFrom",u."name" AS "staffName" FROM "SalaryStructure" ss JOIN "User" u ON u."id"=ss."staffId" AND u."schoolId"=ss."schoolId" WHERE ss."schoolId"=$1 AND ss."status"='active' AND u."status"='active' AND ($2::text[] IS NULL OR ss."staffId"=ANY($2::text[])) ORDER BY u."name"`,input.schoolId,selected.length?selected:null);if(!structures.length)throw new AppError("No active salary structures match this payroll run.",409,"NO_PAYROLL_STAFF");
  await tx.$executeRawUnsafe(`DELETE FROM "Payslip" WHERE "schoolId"=$1 AND "payrollRunId"=$2 AND "status"='draft'`,input.schoolId,runId);
  let totalNet=new Prisma.Decimal(0);for(const structure of structures){const components=await tx.$queryRawUnsafe<ComponentRow[]>(`SELECT "id","name","componentType","calculationType","value","taxable","pensionable","employerOnly","sortOrder" FROM "PayrollSalaryComponent" WHERE "schoolId"=$1 AND "salaryStructureId"=$2 ORDER BY "sortOrder"`,input.schoolId,structure.id);const result=resolveComponents(components);const snapshot=result.rows.map(r=>({name:r.name,type:r.componentType,calculationType:r.calculationType,value:r.value.toFixed(2),amount:r.amount.toFixed(2),taxable:r.taxable,pensionable:r.pensionable,employerOnly:r.employerOnly}));await tx.$executeRawUnsafe(`INSERT INTO "Payslip" ("id","schoolId","payrollRunId","staffId","gross","deductions","net","componentSnapshot","earningsTotal","deductionsTotal","taxTotal","employerContributionTotal","status","createdAt") VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$5,$9,$10,$11,'processed',CURRENT_TIMESTAMP) ON CONFLICT ("schoolId","payrollRunId","staffId") DO UPDATE SET "gross"=EXCLUDED."gross","deductions"=EXCLUDED."deductions","net"=EXCLUDED."net","componentSnapshot"=EXCLUDED."componentSnapshot","earningsTotal"=EXCLUDED."earningsTotal","deductionsTotal"=EXCLUDED."deductionsTotal","taxTotal"=EXCLUDED."taxTotal","employerContributionTotal"=EXCLUDED."employerContributionTotal","status"='processed'`,createId(),input.schoolId,runId,structure.staffId,result.earnings,JSON.stringify({total:result.deductions.toFixed(2)}),result.net,JSON.stringify(snapshot),result.deductions,result.taxes,result.employer);totalNet=totalNet.plus(result.net);}
  await tx.$executeRawUnsafe(`UPDATE "PayrollRun" SET "status"='processed',"processedAt"=CURRENT_TIMESTAMP,"createdBy"=COALESCE("createdBy",$1) WHERE "schoolId"=$2 AND "id"=$3`,input.actorId,input.schoolId,runId);await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"payroll_v2.run_processed",entityType:"PayrollRun",entityId:runId,after:{period:input.period,staffCount:structures.length,totalNet:money(totalNet).toFixed(2),selected:selected.length>0}});return{id:runId,staffCount:structures.length,totalNet:money(totalNet).toFixed(2)};
}

export async function markPayrollPaidV2(tx:TenantDb,input:{schoolId:string;actorId:string;runId:string;staffIds?:string[];paymentReference?:string|null}){
  await requirePermission(tx,input.actorId,"payroll:mark_paid");await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payroll-paid:${input.schoolId}:${input.runId}`}))`;
  const runs=await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "PayrollRun" WHERE "schoolId"=$1 AND "id"=$2 FOR UPDATE`,input.schoolId,input.runId);const run=runs[0];if(!run)throw new AppError("Payroll run not found.",404,"NOT_FOUND");if(!['processed','paid'].includes(run.status))throw new AppError("Payroll must be processed before payment.",409,"PAYROLL_NOT_PROCESSED");const ids=input.staffIds?.filter(Boolean)??[];
  const result=await tx.$executeRawUnsafe(`UPDATE "Payslip" SET "status"='paid',"paidAt"=COALESCE("paidAt",CURRENT_TIMESTAMP),"paymentReference"=COALESCE($1,"paymentReference"),"markedPaidBy"=$2 WHERE "schoolId"=$3 AND "payrollRunId"=$4 AND "status"<>'paid' AND ($5::text[] IS NULL OR "staffId"=ANY($5::text[]))`,input.paymentReference?.trim()||null,input.actorId,input.schoolId,input.runId,ids.length?ids:null);const outstanding=await tx.$queryRawUnsafe<Array<{count:bigint}>>(`SELECT COUNT(*)::bigint AS count FROM "Payslip" WHERE "schoolId"=$1 AND "payrollRunId"=$2 AND "status"<>'paid'`,input.schoolId,input.runId);if(Number(outstanding[0]?.count??0)===0)await tx.$executeRawUnsafe(`UPDATE "PayrollRun" SET "status"='paid',"paidAt"=COALESCE("paidAt",CURRENT_TIMESTAMP),"approvedBy"=COALESCE("approvedBy",$1),"approvedAt"=COALESCE("approvedAt",CURRENT_TIMESTAMP),"paymentReference"=COALESCE($2,"paymentReference") WHERE "schoolId"=$3 AND "id"=$4`,input.actorId,input.paymentReference?.trim()||null,input.schoolId,input.runId);await appendSchoolAudit(tx,{schoolId:input.schoolId,actorId:input.actorId,action:"payroll_v2.payment_marked",entityType:"PayrollRun",entityId:input.runId,after:{staffIds:ids.length?ids:'all',updated:Number(result),paymentReference:input.paymentReference||null}});return{id:input.runId,updated:Number(result)};
}
