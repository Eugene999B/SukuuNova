import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { recordAllocatedPaymentV2 } from "./finance-v2-service";

const money=(value:unknown)=>new Prisma.Decimal(String(value??0)).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);

type Input={
  schoolId:string;
  actorId:string;
  studentId:string;
  invoiceId:string;
  method:string;
  reference:string;
  allocations:Array<{chargeId:string;amount:number}>;
};

async function existingPaymentForReference(tx:TenantDb,schoolId:string,reference:string){
  const payment=await tx.payment.findFirst({
    where:{schoolId,reference},
    select:{id:true,invoiceId:true,amount:true,method:true,createdAt:true},
  });
  if(!payment)return null;
  const allocations=await tx.$queryRawUnsafe<Array<{chargeId:string;amount:Prisma.Decimal}>>(
    `SELECT "chargeId","amount" FROM "FinancePaymentAllocation" WHERE "schoolId"=$1 AND "paymentId"=$2 ORDER BY "chargeId"`,
    schoolId,
    payment.id,
  );
  return{payment,allocations};
}

function matchesRetry(existing:Awaited<ReturnType<typeof existingPaymentForReference>>,input:Input){
  if(!existing)return false;
  if(existing.payment.invoiceId!==input.invoiceId||existing.payment.method!==input.method)return false;
  const requested=new Map<string,Prisma.Decimal>();
  for(const allocation of input.allocations){
    if(requested.has(allocation.chargeId))return false;
    requested.set(allocation.chargeId,money(allocation.amount));
  }
  const requestedTotal=[...requested.values()].reduce((sum,value)=>sum.plus(value),new Prisma.Decimal(0));
  if(!existing.payment.amount.equals(requestedTotal)||existing.allocations.length!==requested.size)return false;
  return existing.allocations.every(row=>requested.get(row.chargeId)?.equals(row.amount)===true);
}

export async function recordAllocatedPaymentV2Safe(tx:TenantDb,input:Input){
  const reference=input.reference.trim();
  if(!reference)throw new AppError("A payment reference or receipt number is required so connection retries cannot create duplicate payments.",400,"REFERENCE_REQUIRED");
  if(new Set(input.allocations.map(row=>row.chargeId)).size!==input.allocations.length){
    throw new AppError("Each fee category can only appear once in a payment.",400,"DUPLICATE_PAYMENT_ALLOCATION");
  }
  const existing=await existingPaymentForReference(tx,input.schoolId,reference);
  if(existing){
    if(matchesRetry(existing,{...input,reference}))return existing.payment;
    throw new AppError("This payment reference has already been used for a different transaction.",409,"DUPLICATE_PAYMENT_REFERENCE");
  }
  try{
    return await recordAllocatedPaymentV2(tx,{...input,reference});
  }catch(error){
    if((error as{code?:string}).code!=="P2002")throw error;
    const raced=await existingPaymentForReference(tx,input.schoolId,reference);
    if(raced&&matchesRetry(raced,{...input,reference}))return raced.payment;
    throw new AppError("This payment reference has already been used for a different transaction.",409,"DUPLICATE_PAYMENT_REFERENCE");
  }
}
