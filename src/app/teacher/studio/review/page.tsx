import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import TeacherAcademicReviewQueue from "@/components/TeacherAcademicReviewQueue";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "@/app/school/teacher-academic/teacher-academic.css";

export default async function TeacherStudioReviewPage({ searchParams }: { searchParams: Promise<{ workId?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher" || !access.isTeacher) redirect("/dashboard");
    if (!(await access.can("scores:write:assigned")) && !(await access.can("scores:write:all"))) redirect("/teacher");
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
    return { school, role: access.roles.map((role) => role.name).join(" · ") };
  });

  return (
    <AppShell universe="teacher" title="Submission Review" subtitle="Review written answers and confirm suggested marks." active="Teaching Studio" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role={data.role || "Teacher"}>
      <div className="taw-page">
        {params.workId ? <TeacherAcademicReviewQueue workId={params.workId} /> : (
          <section className="taw-card">
            <Link href="/teacher/studio" className="taw-btn ghost"><ArrowLeft size={15}/> Back to Teaching Studio</Link>
            <h2 style={{ marginTop: 18 }}>Choose a published activity to open its review queue.</h2>
            <p className="taw-help">Open the Teaching Studio and select an activity when learner submissions are ready.</p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
