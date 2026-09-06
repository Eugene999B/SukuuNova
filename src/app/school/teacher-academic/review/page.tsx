import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import TeacherAcademicReviewQueue from "@/components/TeacherAcademicReviewQueue";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import "../teacher-academic.css";

export default async function TeacherAcademicReviewPage({ searchParams }: { searchParams: Promise<{ workId?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const workId = params.workId;
  const allowed = await withTenant(session.schoolId, async tx => (await hasPermission(tx, session.userId, "scores:write:assigned")) || (await hasPermission(tx, session.userId, "scores:write:all")));
  if (!allowed) redirect("/school/gradebook");
  return <AppShell universe="school" title="Academic review" subtitle="Confirm suggested and written-response marks" active="Teacher Academic Studio" userName={session.name}><div className="taw-page">{workId ? <TeacherAcademicReviewQueue workId={workId} /> : <section className="taw-card"><Link href="/school/teacher-academic" className="taw-btn ghost"><ArrowLeft size={15}/> Back to Teacher Academic Studio</Link><h2 style={{marginTop:18}}>Choose a published activity to open its review queue.</h2><p className="taw-help">Open the teacher studio and select an activity when review submissions are ready.</p></section>}</div></AppShell>;
}
