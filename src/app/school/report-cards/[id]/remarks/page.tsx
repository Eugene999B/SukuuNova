import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import RemarkEditor from "./RemarkEditor";
export default async function ReportRemarkPage({params}:{params:Promise<{id:string}>}){const session=await requireSchoolSession();const {id}=await params;const data=await withTenant(session.schoolId,async(tx)=>{await requirePermission(tx,session.userId,"report_cards:view");return tx.reportCard.findFirst({where:{id,schoolId:session.schoolId},select:{id:true,remarks:true,status:true,student:{select:{name:true,class:{select:{name:true,classTeacherId:true}}}},school:{select:{name:true,uniqueCode:true}}}})});if(!data)return notFound();if(data.student.class?.classTeacherId!==session.userId&&data.status!=="draft")return notFound();return <AppShell universe="school" title="Class Teacher Remark" subtitle="Report-card remark." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}><RemarkEditor reportCardId={data.id} initial={data.remarks??""} student={data.student.name}/></AppShell>}
