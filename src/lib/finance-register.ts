import type { TenantDb } from "./db";
import { AppError } from "./errors";
export type FinanceRegisterRow = { id:string; type:string; date:Date; party:string; category:string; method:string; reference:string; status:string; amount:string };
export function financeRegisterRange(url:URL) {
  const parse=(key:string,end:boolean)=>{
    const value=url.searchParams.get(key);
    if(!value)return null;
    const d=new Date(value+"T00:00:00.000Z");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new AppError("Choose a valid report date.",400,"INVALID_REPORT_DATE");
    if(end)d.setUTCHours(23,59,59,999);
    return d;
  };
  const from=parse("from",false),to=parse("to",true);
  if(from&&to&&from>to)throw new AppError("The start date must be before the end date.",400,"INVALID_REPORT_RANGE");
  return{from,to};
}
export async function loadFinanceRegister(tx:TenantDb,schoolId:string,from:Date|null,to:Date|null,limit=5001,offset=0) {
 return tx.$queryRawUnsafe<FinanceRegisterRow[]>(`
 WITH entries AS (
 SELECT p."id", 'Payment' AS type,p."createdAt" AS date,s."name" AS party,'Fees' AS category,p."method",COALESCE(p."reference",p."id") AS reference,'posted' AS status,p."amount"
 FROM "Payment" p JOIN "Invoice" i ON i."id"=p."invoiceId" AND i."schoolId"=p."schoolId"
 JOIN "Student" s ON s."id"=i."studentId" AND s."schoolId"=i."schoolId" WHERE p."schoolId"=$1
 UNION ALL
 SELECT r."id",'Payment reversal',r."createdAt",s."name",'Fees',p."method",COALESCE(p."reference",p."id") || ' / ' || r."id",'posted',-r."amount"
 FROM "PaymentReversal" r JOIN "Payment" p ON p."id"=r."paymentId" AND p."schoolId"=r."schoolId"
 JOIN "Invoice" i ON i."id"=p."invoiceId" AND i."schoolId"=p."schoolId"
 JOIN "Student" s ON s."id"=i."studentId" AND s."schoolId"=i."schoolId" WHERE r."schoolId"=$1
 UNION ALL
 SELECT e."id",'Expense recorded (not cash confirmation)',e."expenseDate"::timestamp,e."vendor",e."category",e."paymentMethod",COALESCE(e."reference",e."id"),'recorded',-e."amount"
 FROM "FinanceExpense" e WHERE e."schoolId"=$1
 UNION ALL
 SELECT e."id" || ':reversal','Expense reversal',e."reversedAt",e."vendor",e."category",e."paymentMethod",COALESCE(e."reference",e."id"),'reversed',e."amount"
 FROM "FinanceExpense" e WHERE e."schoolId"=$1 AND e."reversedAt" IS NOT NULL
 )
 SELECT "id",type,date,party,category,method,reference,status,amount::text AS amount FROM entries
 WHERE ($2::timestamp IS NULL OR date>=$2) AND ($3::timestamp IS NULL OR date<=$3)
 ORDER BY date DESC,"id" DESC LIMIT $4 OFFSET $5`,schoolId,from,to,limit,offset);
}
