import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "./handout.css";

export default async function SettingsHandoutPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({
    where: { id: session.schoolId },
    select: { name: true, uniqueCode: true, logoUrl: true },
  }));
  if (!school) return null;

  return (
    <AppShell universe="school" title="SukuuNova Handout" subtitle="A clean, printable reference for your school workspace." active="School Settings" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}>
      <div className="sn-handout">
        <section className="sn-handout-sheet">
          <div className="sn-handout-brand">{school.logoUrl ? <img src={school.logoUrl} alt="" /> : <span>{school.name.slice(0, 1).toUpperCase()}</span>}<div><small>SUKUUNOVA</small><strong>{school.name}</strong><em>{school.uniqueCode}</em></div></div>
          <div className="sn-handout-head"><span>School workspace reference</span><h1>How your SukuuNova school is organised</h1><p>Use the control centre to keep your school identity, academic calendar, people, reporting and communication aligned.</p></div>
          <div className="sn-handout-grid">
            <article><b>School identity</b><span>Profile, branding, official document identity and school settings.</span></article>
            <article><b>Academics</b><span>Academic years, terms, classes, subjects, timetable, gradebook and report cards.</span></article>
            <article><b>People & access</b><span>Students, guardians, staff accounts, roles and delegated access.</span></article>
            <article><b>Finance</b><span>Fees, invoices, payments, arrears, payroll and financial records.</span></article>
            <article><b>Communication</b><span>Messages, announcements and school-to-family communication.</span></article>
            <article><b>Reports & downloads</b><span>Operational reports and school-branded official documents.</span></article>
          </div>
          <footer>Generated from the SukuuNova school workspace · {school.name}</footer>
        </section>
        <div className="sn-handout-actions"><button onClick={() => window.print()}>Print / Save PDF</button><Link href="/school/settings">Back to School Settings</Link></div>
      </div>
    </AppShell>
  );
}
