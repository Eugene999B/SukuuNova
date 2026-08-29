import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

const exportsList = [
  { title: "Student directory", detail: "Admission number, learner name, class and status.", href: "/api/school/exports/students.csv" },
  { title: "Gradebook results", detail: "Assessment columns, percentages, totals, grades and positions.", href: "/api/school/exports/gradebook.csv" },
  { title: "Attendance summary", detail: "Student attendance records for the selected academic period.", href: "/api/school/exports/attendance.csv" },
  { title: "Fee balances", detail: "Invoice totals, payments and outstanding balances.", href: "/api/school/exports/fees.csv" },
  { title: "Staff directory", detail: "School workforce and account information.", href: "/api/school/exports/staff.csv" },
  { title: "Class timetable", detail: "A print-ready weekly class schedule with school identity.", href: "/school/timetable/print" }
];

export default async function DownloadsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "reports:view");
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
    const [students, staff, classes] = await Promise.all([
      tx.student.count({ where: { status: "active" } }),
      tx.user.count({ where: { status: "active" } }),
      tx.class.count()
    ]);
    return { school, students, staff, classes };
  });
  return <AppShell universe="school" title="Downloads & Exports" subtitle="Take clean, school-ready information with you. The download should be as useful as the screen." active="Reports" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="app-banner"><div><h3>Your school's information, ready to leave the screen.</h3><p>Exports are permission-checked on the server. Large exports should eventually run as background jobs so nobody has to keep a browser tab open.</p></div><span className="app-pill">{data.students} students · {data.staff} staff · {data.classes} classes</span></div>
    <section className="app-card app-panel"><div className="app-card-head"><div><h2>Common downloads</h2><p>Start with the files schools use most often.</p></div></div>{exportsList.map((item)=><div className="app-list-row" key={item.title}><div><b>{item.title}</b><span>{item.detail}</span></div><Link className="app-action" href={item.href}><strong>{item.href.endsWith(".csv") ? "Download" : "Open"}</strong>{item.href.endsWith(".csv") ? "CSV / Excel" : "print view"}</Link></div>)}</section>
    <div className="app-dashboard-grid"><section className="app-card app-panel"><h2>What we are building toward</h2><p>Every generated file should carry the school name, logo, academic year/term, filter context, generation date and a clear title. Reports should be easy to print or hand to a colleague without extra editing.</p></section><section className="app-card app-panel"><h2>Bulk documents</h2><p>Class report packs, individual report cards, payroll packs, fee statements and archive bundles should be generated together and stored in a secure download history.</p><Link className="app-action" href="/school/report-cards"><strong>Open report cards</strong>Generate a class pack</Link></section></div>
  </AppShell>;
}
