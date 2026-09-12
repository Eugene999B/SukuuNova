import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { createExpenseV2, createFinanceCategory, createFeeStructureV2, createScholarshipProgramV2, decideExpenseV2, financeV2Snapshot, publishFeeStructureV2 } from "@/lib/finance-v2-service";
import { recordAllocatedPaymentV2Safe } from "@/lib/finance-v2-payment-service";
import { reverseFinanceV2Payment } from "@/lib/finance-v2-reversal";
import { requestScholarshipV2 } from "@/lib/finance-v2-scholarship-service";

const line=z.object({categoryId:z.string().min(1),amount:z.coerce.number().min(0),dueDate:z.string().nullable().optional(),optional:z.boolean().optional()});
const allocation=z.object({chargeId:z.string().min(1),amount:z.coerce.number().positive()});
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("category.create"),name:z.string().min(2).max(80),code:z.string().min(1).max(30),kind:z.enum(["tuition","transport","canteen","boarding","books","exam","pta","activity","uniform","technology","other"]),required:z.boolean().default(true)}),
  z.object({action:z.literal("structure.create"),termId:z.string().min(1),classId:z.string().min(1),name:z.string().min(2).max(120),lines:z.array(line).min(1).max(30)}),
  z.object({action:z.literal("structure.publish"),structureId:z.string().min(1)}),
  z.object({action:z.literal("payment.record"),studentId:z.string().min(1),invoiceId:z.string().min(1),method:z.string().min(1).max(30),reference:z.string().trim().min(1).max(120),allocations:z.array(allocation).min(1).max(30)}),
  z.object({action:z.literal("payment.reverse"),paymentId:z.string().min(1),amount:z.coerce.number().positive(),reason:z.string().min(2).max(500)}),
  z.object({action:z.literal("scholarship.program.create"),name:z.string().min(2).max(120),sponsor:z.string().max(160).nullable().optional(),reason:z.string().max(500).nullable().optional()}),
  z.object({action:z.literal("scholarship.award"),programId:z.string().min(1),studentId:z.string().min(1),termId:z.string().min(1),categoryId:z.string().nullable().optional(),mode:z.enum(["percentage","fixed"]),value:z.coerce.number().positive(),capAmount:z.coerce.number().nonnegative().nullable().optional(),note:z.string().max(500).nullable().optional()}),
  z.object({action:z.literal("expense.create"),expenseDate:z.string().min(8),category:z.string().min(2).max(80),vendor:z.string().min(2).max(160),amount:z.coerce.number().positive(),paymentMethod:z.string().min(1).max(30),reference:z.string().max(120).nullable().optional(),description:z.string().max(1000).nullable().optional(),evidenceUrl:z.string().max(1000).nullable().optional()}),
  z.object({action:z.literal("expense.decide"),expenseId:z.string().min(1),decision:z.enum(["approve","reverse"]),reason:z.string().max(500).nullable().optional()}),
]);

export async function GET(){try{const session=await requireSchoolSession();const data=await withTenant(session.schoolId,tx=>financeV2Snapshot(tx,session.schoolId,session.userId));return NextResponse.json(data,{headers:{"cache-control":"private, no-store"}});}catch(error){return routeError(error);}}

export async function POST(request:Request){try{const session=await requireSchoolSession();const input=await parseJson(request,schema);const result=await withTenant(session.schoolId,async tx=>{switch(input.action){case"category.create":return createFinanceCategory(tx,{schoolId:session.schoolId,actorId:session.userId,...input});case"structure.create":return createFeeStructureV2(tx,{schoolId:session.schoolId,actorId:session.userId,...input});case"structure.publish":return publishFeeStructureV2(tx,{schoolId:session.schoolId,actorId:session.userId,structureId:input.structureId});case"payment.record":return recordAllocatedPaymentV2Safe(tx,{schoolId:session.schoolId,actorId:session.userId,...input});case"payment.reverse":return reverseFinanceV2Payment(tx,{schoolId:session.schoolId,actorId:session.userId,paymentId:input.paymentId,amount:input.amount,reason:input.reason});case"scholarship.program.create":return createScholarshipProgramV2(tx,{schoolId:session.schoolId,actorId:session.userId,...input});case"scholarship.award":return requestScholarshipV2(tx,{schoolId:session.schoolId,actorId:session.userId,...input});case"expense.create":return createExpenseV2(tx,{schoolId:session.schoolId,actorId:session.userId,...input});case"expense.decide":return decideExpenseV2(tx,{schoolId:session.schoolId,actorId:session.userId,...input});}});return NextResponse.json({ok:true,result},{headers:{"cache-control":"private, no-store"}});}catch(error){return routeError(error);}}
