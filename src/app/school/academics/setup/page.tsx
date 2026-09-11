import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AcademicWorkspaceNav } from "@/components/AcademicWorkspaceNav";
import { AcademicSetupConsole } from "@/components/AcademicSetupConsole";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "./academic-setup.css";
import "../../academic-workspace.css";

export default async function AcademicSetupPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({
    where: { id: session.schoolId },
    select: { name: true, uniqueCode: true },
  }));

  return <AppShell
    universe="school"
    title="Academic Setup"
    subtitle="Define the rules every academic workflow uses."
    active="Academic Setup"
    schoolName={school?.name ?? "School Workspace"}
    schoolCode={school?.uniqueCode ?? ""}
    userName={session.name}
  >
    <div className="academic-page">
      <section className="academic-page-hero">
        <div className="academic-page-hero-copy"><span className="academic-page-overline">ACADEMIC SETUP · SOURCE OF TRUTH</span><h1>Configure the school once, then let the workflows follow the same rules.</h1><p>Set teaching days, lesson times, assessment weights and report behaviour here. Gradebook, Performance, Timetable and Report Cards should all read from this academic model.</p></div>
        <div className="academic-page-hero-side"><div className="academic-page-context"><span className="academic-context-chip"><strong>School</strong> {school?.name ?? "Current school"}</span><span className="academic-context-chip"><strong>Controls</strong> Calendar · timetable · grading · reports</span></div><div className="academic-page-actions"><Link className="academic-btn-secondary" href="/school/terms">Terms & calendar</Link><Link className="academic-btn-secondary" href="/school/academics/health">Readiness</Link></div></div>
      </section>
      <AcademicWorkspaceNav current="setup" />
      <AcademicSetupConsole />
    </div>
  </AppShell>;
}
