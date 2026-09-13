import { AppShell } from "@/components/AppShell";
import ClassTeacherDesk from "@/components/ClassTeacherDesk";
import { requireSchoolSession } from "@/lib/school-auth";
import "./class-teacher.css";

export default async function ClassTeacherPage() {
  const session = await requireSchoolSession();
  return <AppShell
    universe="school"
    title="My Class"
    subtitle="Whole-class oversight, report readiness and year-end recommendations."
    active="Teacher Academic Studio"
    userName={session.name}
  >
    <ClassTeacherDesk />
  </AppShell>;
}
