/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, IdCard, ShieldCheck, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { IdentityCardPreview } from "@/components/IdentityCardPreview";
import { StaffPortraitEditor } from "@/components/staff/StaffPortraitEditor";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { isSchoolStaffAccount } from "@/lib/authorization";
import { listIdentityCards } from "@/lib/identity-card-service";
import { identityCardCompactVerificationPath } from "@/lib/identity-card-compact-verification";
import "./staff-profile.css";

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id: staffId } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "users:read");
    const [school, staff, portrait, canManageCards, canEditStaff] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } }),
      tx.user.findFirst({
        where: { id: staffId, schoolId: session.schoolId },
        select: {
          id: true, name: true, email: true, phone: true, status: true, createdAt: true,
          userRoles: { select: { role: { select: { name: true, key: true } } } },
          classTeacherFor: { select: { id: true, name: true, level: true } },
          subjectAssignments: { select: { subject: { select: { name: true } }, class: { select: { name: true, level: true } } } },
        },
      }),
      tx.$queryRawUnsafe<Array<{ photoUrl: string | null }>>(`SELECT "photoUrl" FROM "User" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`, session.schoolId, staffId),
      hasPermission(tx, session.userId, "identity_cards:manage").catch(() => false),
      hasPermission(tx, session.userId, "users:write").catch(() => false),
    ]);
    if (!school || !staff) return null;
    if (!isSchoolStaffAccount(staff.userRoles.map(({ role }) => role))) return null;
    const cards = canManageCards ? await listIdentityCards(tx, session.schoolId, school.uniqueCode, session.userId) : [];
    const currentCard = cards.find((card) => card.personType === "staff" && card.staffId === staff.id && card.status === "active" && !card.isExpired) ?? null;
    return { school, staff, photoUrl: portrait[0]?.photoUrl ?? null, currentCard, canManageCards, canEditStaff };
  });
  if (!data) notFound();

  const roles = data.staff.userRoles.map((item) => item.role.name);
  const verifyHref = data.currentCard
    ? identityCardCompactVerificationPath(data.school.uniqueCode, data.currentCard)
    : null;

  return <AppShell universe="school" title={data.staff.name} subtitle="Staff profile, teaching scope and school identity." active="Staff & Teachers" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="staff-profile-page">
      <div className="staff-profile-back"><Link href="/school/staff"><ArrowLeft size={15}/> Back to staff</Link></div>
      <section className="staff-profile-hero">
        <div className="staff-profile-avatar">{data.photoUrl ? <img src={data.photoUrl} alt={`${data.staff.name} portrait`}/> : <span>{data.staff.name.split(/\s+/).slice(0,2).map((part) => part[0]).join("").toUpperCase()}</span>}</div>
        <div><span className="app-eyebrow">STAFF PROFILE</span><h2>{data.staff.name}</h2><p>{roles.join(" · ") || "Role not assigned"}</p><div className="staff-profile-tags"><span>{data.staff.status}</span>{data.staff.email ? <span>{data.staff.email}</span> : null}{data.staff.phone ? <span>{data.staff.phone}</span> : null}</div></div>
      </section>

      <div className="staff-profile-grid">
        <section className="app-card app-panel staff-profile-id-panel">
          <div className="app-card-head"><div><span className="app-eyebrow">SCHOOL ID</span><h2>Identity card</h2><p>Front and back of the same CR80 credential, ready for direct or print-shop output.</p></div></div>
          {data.canManageCards && data.currentCard && verifyHref ? <IdentityCardPreview school={data.school} card={{ ...data.currentCard, photoUrl: data.photoUrl }} downloadHref={`/api/school/identity-cards/staff/${encodeURIComponent(data.staff.id)}`} verifyHref={verifyHref}/>
            : data.canManageCards ? <div className="staff-profile-empty"><IdCard size={20}/><strong>No current ID card.</strong><span>Open Identity Cards to reconcile or reissue this staff card.</span><Link href="/school/id-cards">Open Identity Cards →</Link></div>
            : <div className="staff-profile-empty"><ShieldCheck size={20}/><strong>ID-card management access required.</strong><span>You can view this staff record, but cannot issue or download identity cards.</span></div>}
        </section>

        <section className="app-card app-panel staff-profile-photo-panel">
          <div className="app-card-head"><div><span className="app-eyebrow">PORTRAIT</span><h2>Official photo</h2><p>A clear portrait is used on new staff ID downloads.</p></div></div>
          {data.canEditStaff ? <StaffPortraitEditor staffId={data.staff.id} staffName={data.staff.name} initialPhoto={data.photoUrl}/> : <div className="staff-profile-empty"><ShieldCheck size={20}/><strong>Staff editing access required.</strong><span>Your current permissions allow profile viewing only.</span></div>}
        </section>
      </div>

      <section className="staff-profile-summary">
        <article><UsersRound size={17}/><small>Roles</small><strong>{roles.length || 0}</strong><span>{roles.join(", ") || "None assigned"}</span></article>
        <article><CalendarClock size={17}/><small>Class leadership</small><strong>{data.staff.classTeacherFor.length}</strong><span>{data.staff.classTeacherFor.map((item) => `${item.level ?? ""} ${item.name}`.trim()).join(", ") || "No class lead"}</span></article>
        <article><IdCard size={17}/><small>Teaching assignments</small><strong>{data.staff.subjectAssignments.length}</strong><span>{data.staff.subjectAssignments.slice(0,3).map((item) => `${item.class.level ?? ""} ${item.class.name} · ${item.subject.name}`.trim()).join(", ") || "No teaching assignment"}</span></article>
      </section>
    </div>
  </AppShell>;
}
