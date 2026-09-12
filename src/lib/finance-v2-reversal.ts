import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { reversePayment } from "./finance-service";

export async function reverseFinanceV2Payment(tx:TenantDb,input:{schoolId:string;actorId:string;paymentId:string;amount:number;reason:string}){
  const payment=await tx.payment.findFirst({where:{id:input.paymentId,schoolId:input.schoolId},select:{id:true,invoiceId:true,amount:true,reversals:{select:{amount:true}}}});
  if(!payment)throw new AppError("Payment not found.",404,"NOT_FOUND");
  const result=await reversePayment(tx,{...input,idempotencyKey:`finance-v2:${input.paymentId}:${input.amount.toFixed(2)}:${input.reason.trim().slice(0,32)}`});
  await tx.$executeRawUnsafe(`UPDATE "FinanceStudentCharge" ch SET "status"=CASE WHEN ch."netAmount"<=0 THEN 'waived' WHEN COALESCE(x.paid,0)>=ch."netAmount" THEN 'paid' WHEN COALESCE(x.paid,0)>0 THEN 'partial' ELSE 'open' END,"updatedAt"=CURRENT_TIMESTAMP FROM (SELECT a."chargeId",SUM(a."amount" * GREATEST(0,1-COALESCE((SELECT SUM(r."amount") FROM "PaymentReversal" r WHERE r."schoolId"=a."schoolId" AND r."paymentId"=a."paymentId"),0)/NULLIF(p."amount",0))) AS paid FROM "FinancePaymentAllocation" a JOIN "Payment" p ON p."id"=a."paymentId" AND p."schoolId"=a."schoolId" WHERE a."schoolId"=$1 GROUP BY a."chargeId") x WHERE ch."schoolId"=$1 AND ch."invoiceId"=$2 AND x."chargeId"=ch."id"`,input.schoolId,payment.invoiceId);
  return result;
}
