import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { markPayrollPaidV2, payrollV2Snapshot, saveSalaryStructureV2 } from "@/lib/payroll-v2-service";
import { runPayrollV2ForEffectiveStaff } from "@/lib/payroll-v2-run-guard";

const component=z.object({name:z.string().min(2).max(100),componentType:z.enum(["earning","allowance","benefit","deduction","tax","employer_contribution"]),calculationType:z.enum(["fixed","percentage"]),value:z.coerce.number().nonnegative(),taxable:z.boolean().optional(),pensionable:z.boolean().optional(),employerOnly:z.boolean().optional()});
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("salary.save"),staffId:z.string().min(1),effectiveFrom:z.string().min(8),components:z.array(component).min(1).max(40)}),
  z.object({action:z.literal("run.process"),period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),staffIds:z.array(z.string().min(1)).max(500).optional()}),
  z.object({action:z.literal("run.mark_paid"),runId:z.string().min(1),staffIds:z.array(z.string().min(1)).max(500).optional(),paymentReference:z.string().max(160).nullable().optional()}),
]);

export async function GET(){try{const session=await requireSchoolSession();const data=await withTenant(session.schoolId,tx=>payrollV2Snapshot(tx,session.schoolId,session.userId));return NextResponse.json(data,{headers:{"cache-control":"private, no-store"}});}catch(error){return routeError(error);}}
export async function POST(request:Request){try{const session=await requireSchoolSession();const input=await parseJson(request,schema);const result=await withTenant(session.schoolId,tx=>{switch(input.action){case"salary.save":return saveSalaryStructureV2(tx,{schoolId:session.schoolId,actorId:session.userId,...input});case"run.process":return runPayrollV2ForEffectiveStaff(tx,{schoolId:session.schoolId,actorId:session.userId,period:input.period,staffIds:input.staffIds});case"run.mark_paid":return markPayrollPaidV2(tx,{schoolId:session.schoolId,actorId:session.userId,runId:input.runId,staffIds:input.staffIds,paymentReference:input.paymentReference});}});return NextResponse.json({ok:true,result},{headers:{"cache-control":"private, no-store"}});}catch(error){return routeError(error);}}
