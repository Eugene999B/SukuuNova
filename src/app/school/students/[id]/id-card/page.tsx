import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export default async function StudentIdCardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const student = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    return tx.student.findFirst({
      where: { id, schoolId: session.schoolId },
      select: { id: true, name: true, admissionNo: true, class: { select: { name: true } }, school: { select: { name: true, uniqueCode: true } } },
    });
  });
  if (!student) notFound();

  return (
    <AppShell universe="school" title={`${student.name} · Identity Card`} subtitle="Generate the current signed school identity card for this learner." active="Students" schoolName={student.school.name} schoolCode={student.school.uniqueCode} userName={session.name}>
      <main className="mx-auto max-w-3xl px-1 py-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <span className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Learner identity card</span>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{student.name}</h1>
          <p className="mt-2 text-sm text-slate-500">{student.admissionNo} · {student.class?.name ?? "No class assigned"}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={`/api/school/identity-cards/student/${encodeURIComponent(student.id)}`} className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">Download student ID card PDF</a>
            <Link href="/school/id-cards" className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Open ID card workspace</Link>
            <Link href={`/school/students/${student.id}/documents`} className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Back to documents</Link>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-500">The PDF download remains protected by school identity-card permissions.</p>
        </section>
      </main>
    </AppShell>
  );
}
