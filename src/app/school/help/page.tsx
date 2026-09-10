import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

const guideGroups = [
  { title: "Getting started", links: [["School settings", "/school/settings"], ["People & users", "/school/people"], ["People & access", "/school/settings/access"], ["Terms", "/school/terms"]] },
  { title: "Academics", links: [["Academic setup", "/school/academics/setup"], ["Timetable", "/school/timetable"], ["Gradebook", "/school/gradebook"], ["Report cards", "/school/report-cards"]] },
  { title: "Finance", links: [["School fees", "/school/fees"], ["Invoices", "/school/fees/invoices"], ["Payments", "/school/fees/payments"], ["Arrears", "/school/fees/arrears"]] },
  { title: "Attendance & people", links: [["Attendance", "/school/attendance"], ["Attendance exceptions", "/school/attendance/exceptions"], ["Students", "/school/students"], ["Staff", "/school/staff"]] },
  { title: "Communication", links: [["Messages", "/school/communications/messages"], ["Announcements", "/school/communications/announcements"], ["SMS / WhatsApp", "/school/communications/broadcasts"], ["Communication settings", "/school/communications/settings"]] },
  { title: "Operations", links: [["Devices", "/school/devices"], ["Visitors", "/school/visitors"], ["Pickup", "/school/pickup"], ["Downloads & exports", "/school/downloads"]] },
] as const;

const popularGuides = [
  ["Create the first academic term", "/school/terms"],
  ["Manage administrator and IT access", "/school/settings/access"],
  ["Approve and publish report cards", "/school/report-cards"],
  ["Record a class attendance register", "/school/attendance/register"],
  ["Generate an official export", "/school/downloads"],
  ["Review payments and balances", "/school/fees/payments"],
] as const;

export default async function HelpPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) return null;

  return (
    <AppShell universe="school" title="Help & Support" subtitle="Find the workflow you need." active="Help & Support" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}>
      <div className="module-workspace help-simple">
        <section className="module-card">
          <div className="module-section-title"><div><span>Popular</span><h3>Common tasks</h3></div></div>
          <div className="module-list">{popularGuides.map(([label, href], index) => <Link key={href} href={href} className="module-list-row"><span className="module-list-no">{index + 1}</span><div><b>{label}</b><span>Open the exact SukuuNova workspace for this task.</span></div></Link>)}</div>
        </section>

        <div className="help-simple-groups">
          {guideGroups.map((group) => <details className="sn-progressive" key={group.title}><summary>{group.title}</summary><div className="sn-progressive-body"><div className="module-list">{group.links.map(([label, href]) => <Link key={href} href={href} className="module-list-row"><div><b>{label}</b></div></Link>)}</div></div></details>)}
        </div>

        <div className="module-notice"><strong>Can’t use a page you expected to access?</strong> Start with <Link href="/school/settings/access">People & Access</Link> to verify the account’s role and effective permissions.</div>
      </div>
    </AppShell>
  );
}