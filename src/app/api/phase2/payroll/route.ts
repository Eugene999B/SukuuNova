import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { hasPermission } from "@/lib/rbac";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { createPayrollRun, markPayrollPaid, processPayrollRun, setSalaryStructure, visiblePayslips } from "@/lib/payroll-service";
const deduction=z.object({label:z.string().min(1),type:z.enum(["fixed","percent"]),value:z.number().nonnegative()});
const schema=z.discriminatedUnion("action",[z.object({action:z.literal("salaryStructure"),staffId:z.string(),grossSalary:z.number().positive(),deductions:z.array(deduction)}),z.object({action:z.literal("createRun"),period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}),z.object({action:z.literal("processRun"),payrollRunId:z.string()}),z.object({action:z.literal("markPaid"),payrollRunId:z.string()})]);
export async function GET(){try{const session=await requireSchoolSession();const data=await withTenant(session.schoolId,async(tx)=>{await requireSchoolFeatureInTransaction(tx,session.schoolId,"payroll");const payslips=(await visiblePayslips(tx,session.userId)).map(({pdfData:_pdfData,...row})=>row);const canManage=await hasPermission(tx,session.userId,"payroll:manage");if(!canManage)return{canManage,payslips,runs:[],structures:[]};const[runs,structures]=await Promise.all([tx.payrollRun.findMany({orderBy:{period:"desc"}}),tx.salaryStructure.findMany({include:{staff:{select:{name:true}}},orderBy:{staff:{name:"asc"}}})]);return{canManage,payslips,runs,structures};});return NextResponse.json(data);}catch(error){return routeError(error);}}
export async function POST(request:Request){try{const session=await requireSchoolSession();const input=await parseJson(request,schema);const result=await withTenant<unknown>(session.schoolId,async(tx)=>{await requireSchoolFeatureInTransaction(tx,session.schoolId,"payroll");const common={schoolId:session.schoolId,actorId:session.userId};switch(input.action){case"salaryStructure":return setSalaryStructure(tx,{...common,...input});case"createRun":return createPayrollRun(tx,{...common,period:input.period});case"processRun":return processPayrollRun(tx,{...common,payrollRunId:input.payrollRunId});case"markPaid":return markPayrollPaid(tx,{...common,payrollRunId:input.payrollRunId});}});return NextResponse.json({ok:true,result});}catch(error){return routeError(error);}}
