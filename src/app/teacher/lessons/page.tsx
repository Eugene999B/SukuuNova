import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import TeacherGhanaLessonPlanner from "@/components/TeacherGhanaLessonPlanner";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "./teacher-lessons.css";
import "./ghana-lesson-planner.css";

export default async function TeacherLessonsPage(){
 const session=await requireSchoolSession();
 const data=await withTenant(session.schoolId,async tx=>{
  const access=await getSchoolAuthorization(tx,session.userId);if(access.workspace!=="teacher"||!access.isTeacher)redirect("/dashboard");
  if(!(await access.can("lesson_plans:manage")))redirect("/teacher");
  const school=await tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}});
  return{school,role:access.roles.map(role=>role.name).join(" · ")};
 });
 return <AppShell universe="teacher" title="Lessons & Planning" subtitle="Ghana-aligned weekly lesson planning, rich authoring, leadership vetting and reflection." active="My Lessons & Planning" schoolName={data.school?.name??"School Workspace"} schoolCode={data.school?.uniqueCode??""} userName={session.name} role={data.role||"Teacher"}><TeacherGhanaLessonPlanner/></AppShell>;
}
