import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

const guideGroups = [
  {
    title: "Getting started",
    detail: "Set up school identity, terms, people and permissions.",
    links: [["School settings", "/school/settings"], ["People & users", "/school/people"], ["Access governance", "/school/settings/access"], ["Terms", "/school/terms"]],
  },
  {
    title: "Academics",
    detail: "Timetable, assessment, gradebook and report cards.",
    links: [["Academic setup", "/school/academics/setup"], ["Timetable", "/school/timetable"], ["Gradebook", "/school/gradebook"], ["Report cards", "/school/report-cards"]],
  },
  {
    title: "Finance",
    detail: "Fees, invoices, payments, arrears and official evidence.",
    links: [["Fee overview", "/school/fees/overview"], ["Invoices", "/school/fees/invoices"], ["Payments", "/school/fees/payments"], ["Arrears", "/school/fees/arrears"]],
  },
  {
    title: "Attendance & people",
    detail: "Daily attendance, learners, guardians and staff operations.",
    links: [["Attendance", "/school/attendance"], ["Attendance exceptions", "/school/attendance/exceptions"], ["Students", "/school/students"], ["Staff", "/school/staff"]],
  },
  {
    title: "Communication",
    detail: "Messages, announcements, broadcasts and delivery history.",
    links: [["Messages", "/school/communications/messages"], ["Announcements", "/school/communications/announcements"], ["Broadcasts", "/school/communications/broadcasts"], ["Communication settings", "/school/communications/settings"]],
  },
  {
    title: "Operations",
    detail: "Devices, visitors, pickup and other school operations.",
    links: [["Devices", "/school/devices"], ["Visitors", "/school/visitors"], ["Pickup", "/school/pickup"], ["Downloads & exports", "/school/downloads"]],
  },
] as const;

const popularGuides = [
  ["Create the first academic term", "/school/terms"],
  ["Manage administrator and IT access", "/school/settings/access"],
  ["Approve and publish report cards", "/school/report-cards"],
  ["Record a class attendance register", "/school/attendance/register"],
  ["Generate an official export", "/school/downloads"],
  ["Review a failed or incomplete payment", "/school/fees/payments"],
] as const;

export default async function HelpPage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) =>
    tx.school.findUnique({
      where: { id: session.schoolId },
      select: { name: true, uniqueCode: true },
    }),
  );

  if (!school) return null;

  return (
    <AppShell
      universe="school"
      title="Help & Support"
      subtitle="Guides and direct links to the live tools in your SukuuNova school workspace."
      active="Help & Support"
      schoolName={school.name}
      schoolCode={school.uniqueCode}
      userName={session.name}
    >
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,.16)]">
          <span className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-300">Product support</span>
          <h2 className="mt-2 text-2xl font-black tracking-tight">Find the right place to do the work</h2>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-300">
            This support centre links to live SukuuNova screens. It does not pretend to offer a knowledge base or ticketing system that is not connected.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {guideGroups.map((group) => (
            <article key={group.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-black text-slate-950">{group.title}</h3>
              <p className="mt-2 text-[10px] leading-5 text-slate-500">{group.detail}</p>
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-3">
                {group.links.map(([label, href]) => (
                  <Link key={href} href={href} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-950">
                    <span>{label}</span><span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.1fr,.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-950">Popular guides</h3>
            <p className="mt-1 text-[10px] text-slate-500">Direct paths to common tasks using the current school workspace.</p>
            <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {popularGuides.map(([label, href]) => (
                <Link key={href} href={href} className="flex items-center justify-between py-3 text-left text-[10px] font-bold text-slate-700 hover:text-slate-950">
                  <span>{label}</span><span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Support boundary</span>
            <h3 className="mt-2 text-sm font-black text-slate-950">Need help with a live workflow?</h3>
            <p className="mt-2 text-[10px] leading-5 text-slate-600">
              Start from the relevant operational screen above so the correct school, permission and workflow context is preserved. There is no connected in-product support ticket form yet.
            </p>
            <Link href="/school/settings/access" className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-3 text-[10px] font-black text-white hover:bg-slate-800">Review access first</Link>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
