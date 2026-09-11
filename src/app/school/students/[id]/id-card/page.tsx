import Link from "next/link";
import { notFound } from "next/navigation";
import { IdCard, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { IdentityCardPreview } from "@/components/IdentityCardPreview";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { identityCardSignature, identityCardVerificationPath, listIdentityCards } from "@/lib/identity-card-service";

export default async function StudentIdCardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [student, school, canManageCards] = await Promise.all([
      tx.student.findFirst({
        where: { id, schoolId: session.schoolId },
        select: { id: true, name: true, admissionNo: true, photoUrl: true, class: { select: { name: true } } },
      }),
      tx.school.findUnique({
        where: { id: session.schoolId },
        select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true },
      }),
      hasPermission(tx, session.userId, "identity_cards:manage").catch(() => false),
    ]);
    if (!student || !school) return null;
    const cards = canManageCards ? await listIdentityCards(tx, session.schoolId, school.uniqueCode, session.userId) : [];
    const currentCard = cards.find((card) => card.personType === "student" && card.studentId === student.id && card.status === "active" && !card.isExpired) ?? null;
    return { student, school, currentCard, canManageCards };
  });
  if (!data) notFound();

  const verifyHref = data.currentCard
    ? `${identityCardVerificationPath(data.school.uniqueCode, data.currentCard.serial)}?sig=${identityCardSignature(data.currentCard)}`
    : null;

  return (
    <AppShell
      universe="school"
      title={`${data.student.name} · Identity Card`}
      subtitle="Front-and-back school identity card preview and secure download."
      active="Students"
      schoolName={data.school.name}
      schoolCode={data.school.uniqueCode}
      userName={session.name}
    >
      <main className="mx-auto max-w-6xl px-1 py-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Learner identity card</span>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{data.student.name}</h1>
              <p className="mt-2 text-sm text-slate-500">{data.student.admissionNo} · {data.student.class?.name ?? "No class assigned"}</p>
            </div>
            <Link href="/school/id-cards" className="button secondary">Open ID card workspace</Link>
          </div>

          {data.canManageCards && data.currentCard && verifyHref ? (
            <IdentityCardPreview
              school={data.school}
              card={{ ...data.currentCard, photoUrl: data.student.photoUrl ?? data.currentCard.photoUrl }}
              downloadHref={`/api/school/identity-cards/student/${encodeURIComponent(data.student.id)}`}
              verifyHref={verifyHref}
            />
          ) : data.canManageCards ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <IdCard className="mx-auto text-slate-500" size={28}/>
              <strong className="mt-3 block text-sm text-slate-900">No current student ID card is available.</strong>
              <span className="mt-1 block text-xs text-slate-500">Open the ID card workspace to reconcile or reissue this learner's credential.</span>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <ShieldCheck className="mx-auto text-slate-500" size={28}/>
              <strong className="mt-3 block text-sm text-slate-900">ID-card management access required.</strong>
              <span className="mt-1 block text-xs text-slate-500">You can view this learner, but your role cannot issue or download identity cards.</span>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/school/students/${data.student.id}/documents`} className="button secondary">Back to documents</Link>
            <Link href={`/school/students/${data.student.id}`} className="button secondary">Student profile</Link>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
