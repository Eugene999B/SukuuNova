import { notFound } from "next/navigation";
import ReportCardPrintStudio from "@/components/ReportCardPrintStudioV2";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getSchoolAuthorization } from "@/lib/authorization";
import { calculateReportCard } from "@/lib/report-card-service";

export default async function ReportCardPrintPage({params}:{params:Promise<{id:string}>}){
 const session=await requireSchoolSession();const {id}=await params;
 const data=await withTenant(session.schoolId,async(tx)=>{
  await requirePermission(tx,session.userId,"report_cards:view");const access=await getSchoolAuthorization(tx,session.userId);
  const gate=await tx.reportCard.findFirst({where:{id,schoolId:session.schoolId},select:{id:true,student:{select:{class:{select:{id:true,classTeacherId:true}}}}}});
  if(!gate||!gate.student.class)return null;
  if(!access.isElevated){if(!access.isTeacher)throw new Error("Only the school academic team or assigned teachers can view report cards.");const assigned=gate.student.class.classTeacherId===session.userId||Boolean(await tx.classSubjectTeacher.findFirst({where:{schoolId:session.schoolId,classId:gate.student.class.id,teacherId:session.userId}}));if(!assigned)throw new Error("Teachers may only view report cards for their assigned classes.");}
  return calculateReportCard(tx,{schoolId:session.schoolId,reportId:id});
 });
 if(!data)notFound();return <ReportCardPrintStudio data={data}/>;
}
