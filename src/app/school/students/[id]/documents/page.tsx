import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export default async function StudentDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const student = await tx.student.findFirst({
      where: { id, schoolId: session.schoolId },
      select: { id: true, name: true, admissionNo: true, class: { select: { name: true } }, school: { select: { name: true, uniqueCode: true } } },
    });
    if (!student) return null;
    return student;
  });
  if (!data) notFound();

  return (
    <AppShell universe="school" title={`${data.name} · Documents`} subtitle="A single place for the learner's school-ready outputs and official document workflows." active="Students" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <main className="mx-auto max-w-5xl space-y-5 px-1 py-2">
        <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">Learner documents</span>
          <h1 className="mt-2 text-2xl font-black tracking-tight">{data.name}</h1>
          <p className="mt-2 text-sm text-slate-300">{data.admissionNo} · {data.class?.name ?? "No class assigned"}</p>
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-slate-900">Identity card</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Download this learner's current signed ID card, or open the card workspace for issuing, reissuing and bulk print packs.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a className="inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white" href={`/api/school/identity-cards/student/${encodeURIComponent(data.id)}`}>Download student ID card</a>
              <Link className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700" href={`/school/students/${data.id}/id-card`}>Student ID card page</Link>
              <Link className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700" href="/school/id-cards">Full workspace</Link>
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-slate-900">Reports & exports</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Use the export centre for school-wide datasets and official print outputs. Individual report-card PDFs are generated from the academic report workflow.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700" href="/school/downloads">Open exports</Link>
              <Link className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700" href="/school/report-cards">Report cards</Link>
            </div>
          </article>
        </section>
      </main>
    </AppShell>
  );
}
