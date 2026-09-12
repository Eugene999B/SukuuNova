import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { decideScholarshipV2 } from "@/lib/finance-v2-scholarship-service";

const schema=z.object({awardId:z.string().min(1),decision:z.enum(["approve","reject"])});

type ScholarshipRow={id:string;studentName:string;programName:string;categoryName:string|null;mode:string;value:unknown;status:string;createdAt:Date;createdByName:string;reduction:unknown;adjustmentStatus:string};

export async function GET(){
  try{
    const session=await requireSchoolSession();
    const data=await withTenant(session.schoolId,async tx=>{
      await requirePermission(tx,session.userId,"finance:read");
      const [rows,canApprove]=await Promise.all([
        tx.$queryRawUnsafe<ScholarshipRow[]>(`SELECT a."id",s."name" AS "studentName",p."name" AS "programName",fc."name" AS "categoryName",a."mode",a."value",a."status",a."createdAt",u."name" AS "createdByName",fa."value" AS reduction,fa."status" AS "adjustmentStatus" FROM "FinanceScholarshipAward" a JOIN "Student" s ON s."id"=a."studentId" AND s."schoolId"=a."schoolId" JOIN "FinanceScholarshipProgram" p ON p."id"=a."programId" AND p."schoolId"=a."schoolId" JOIN "User" u ON u."id"=a."createdBy" AND u."schoolId"=a."schoolId" LEFT JOIN "FinanceFeeCategory" fc ON fc."id"=a."categoryId" AND fc."schoolId"=a."schoolId" LEFT JOIN "P3FinanceAdjustment" fa ON fa."financeScholarshipAwardId"=a."id" AND fa."schoolId"=a."schoolId" WHERE a."schoolId"=$1 ORDER BY a."createdAt" DESC LIMIT 500`,session.schoolId),
        hasPermission(tx,session.userId,"finance:scholarships_approve"),
      ]);
      return{rows,canApprove};
    });
    return NextResponse.json(data,{headers:{"cache-control":"private, no-store"}});
  }catch(error){return routeError(error);}
}

export async function POST(request:Request){
  try{
    const session=await requireSchoolSession();
    const input=await parseJson(request,schema);
    const result=await withTenant(session.schoolId,tx=>decideScholarshipV2(tx,{schoolId:session.schoolId,actorId:session.userId,awardId:input.awardId,decision:input.decision}));
    return NextResponse.json({ok:true,result},{headers:{"cache-control":"private, no-store"}});
  }catch(error){return routeError(error);}
}
