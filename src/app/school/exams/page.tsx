import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AcademicWorkspaceNav } from "@/components/AcademicWorkspaceNav";
import { requireSchoolSession } from "@/lib/school-auth";
import { ForbiddenError } from "@/lib/errors";
import { hasPermission } from "@/lib/rbac";
import "./exams-workspace.css";
import "../academic-workspace.css";

export default async function ExamsPage(){
  const session=await requireSchoolSession();
  const data=await withTenant(session.schoolId,async tx=>{ return null; });
  return <AppShell universe="school" title="Exams & Assessments" subtitle="Build assessment evidence inside the academic model." active="Exams & Assessments"><div /></AppShell>;
}
