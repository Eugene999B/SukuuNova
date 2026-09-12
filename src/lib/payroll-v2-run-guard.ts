import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { runPayrollV2 } from "./payroll-v2-service";

export async function runPayrollV2ForEffectiveStaff(tx:TenantDb,input:{schoolId:string;actorId:string;period:string;staffIds?:string[]}){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period))throw new AppError("Payroll period must be YYYY-MM.",400,"INVALID_PAYROLL_PERIOD");
  const [yearText,monthText]=input.period.split("-");
  const year=Number(yearText);const month=Number(monthText);
  const nextMonth=month===12?`${year+1}-01-01`:`${year}-${String(month+1).padStart(2,"0")}-01`;
  const requested=[...new Set((input.staffIds??[]).filter(Boolean))];
  const eligible=await tx.$queryRawUnsafe<Array<{staffId:string}>>(
    `SELECT ss."staffId" FROM "SalaryStructure" ss JOIN "User" u ON u."id"=ss."staffId" AND u."schoolId"=ss."schoolId" WHERE ss."schoolId"=$1 AND ss."status"='active' AND u."status"='active' AND ss."effectiveFrom" < $2::date AND ($3::text[] IS NULL OR ss."staffId"=ANY($3::text[])) ORDER BY ss."staffId"`,
    input.schoolId,
    nextMonth,
    requested.length?requested:null,
  );
  const eligibleIds=eligible.map(row=>row.staffId);
  if(!eligibleIds.length)throw new AppError("No salary structures are effective for this payroll month.",409,"NO_EFFECTIVE_PAYROLL_STAFF");
  if(requested.length&&eligibleIds.length!==requested.length){
    throw new AppError("One or more selected staff members do not have an active salary structure effective for this payroll month.",409,"PAYROLL_STRUCTURE_NOT_EFFECTIVE");
  }
  return runPayrollV2(tx,{...input,staffIds:eligibleIds});
}
