import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError, AppError, ForbiddenError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

const schema=z.object({reportCardId:z.string().min(1).max(120),remarks:z.string().trim().max(2000)});
export async function PATCH(request:Request){
 try{
  const session=await requireSchoolSession(); const input=await parseJson(request,schema);
  return await withTenant(session.schoolId,async(tx)=>{
   await requirePermission(tx,session.userId,"report_cards:submit");
   const report=await tx.reportCard.findFirst({where:{id:input.reportCardId,schoolId:session.schoolId},select:{id:true,status:true,remarks:true,student:{select:{classId:true,class:{select:{classTeacherId:true}}}}}});
   if(!report)throw new AppError("Report card not found.",404,"NOT_FOUND");
   if(report.student.class?.classTeacherId!==session.userId)throw new ForbiddenError("Only the assigned class teacher can enter this remark.");
   if(report.status!=="draft")throw new AppError("The report is already submitted and its teacher remark is locked.",409,"REPORT_LOCKED");
   const updated=await tx.reportCard.update({where:{id:report.id},data:{remarks:input.remarks.trim()||null}});
   await appendSchoolAudit(tx,{schoolId:session.schoolId,actorId:session.userId,action:"report_card.class_teacher_remark_updated",entityType:"ReportCard",entityId:report.id,before:{remarks:report.remarks},after:{remarks:updated.remarks}});
   return NextResponse.json({ok:true,remarks:updated.remarks});
  });
 }catch(error){return routeError(error);}
}
