/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { getAdmissionApplication } from "@/lib/admissions-v2";
import { LetterActions } from "./LetterActions";
import "../../admissions-v2.css";

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : "—";
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]?.toUpperCase()).join("") || "SN";
}

export default async function AdmissionLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, application] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true } }),
      getAdmissionApplication(tx, session.schoolId, id),
    ]);
    return { school, application };
  });
  if (!data.school || !data.application || !["offered", "accepted", "enrolled"].includes(data.application.status)) notFound();
  const application = data.application;
  const className = `${application.classLevel ? `${application.classLevel} · ` : ""}${application.className ?? application.intendedClassName ?? "the approved class"}`;

  return (
    <AppShell universe="school" title="Admission letter" subtitle={`${application.reference} · official admission document`} active="Applications" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <div className="admissions-v2">
        <div className="admission-letter-actions"><Link className="button secondary" href={`/school/admissions/applications/${application.id}`}>← Application</Link><LetterActions id={application.id}/></div>
        <article className="admission-letter-sheet">
          <header className="admission-letter-brand">
            {data.school.logoUrl ? <img className="admission-letter-logo" src={data.school.logoUrl} alt={`${data.school.name} logo`} /> : <div className="admission-letter-seal">{initials(data.school.name)}</div>}
            <div><h1>{data.school.name}</h1><p>OFFICIAL ADMISSION LETTER · SCHOOL CODE {data.school.uniqueCode}</p></div>
            <div className="admission-letter-seal">{initials(data.school.name)}</div>
          </header>
          <div className="admission-letter-meta"><span>Reference: <strong>{application.reference}</strong></span><span>Date: <strong>{formatDate(application.offerIssuedAt ?? new Date())}</strong></span></div>
          <h2>LETTER OF ADMISSION</h2>
          <p>Dear <strong>{application.guardianName}</strong>,</p>
          <p>Following the review of the admission application, we are pleased to offer <strong>{application.studentName}</strong> admission to <strong>{data.school.name}</strong>.</p>
          <div className="admission-letter-box">
            <strong>Learner:</strong> {application.studentName}<br/>
            <strong>Class:</strong> {className}<br/>
            <strong>Academic year:</strong> {application.academicYearName ?? "—"}<br/>
            <strong>Entry term:</strong> {application.termName ?? "—"}<br/>
            <strong>Admission / reporting date:</strong> {formatDate(application.admissionDate)}<br/>
            <strong>Entry type:</strong> {application.entryType}
          </div>
          <p>This offer is issued on the basis of the information supplied in the application and the school&apos;s admission requirements. The family is expected to complete all required school documentation, observe the school&apos;s policies and make the necessary arrangements for the learner&apos;s successful start.</p>
          {application.decisionNote ? <p><strong>Admission note:</strong> {application.decisionNote}</p> : null}
          <p>We look forward to welcoming <strong>{application.studentName}</strong> into our school community and supporting the learner&apos;s academic and personal development.</p>
          <p>Yours faithfully,</p>
          <div className="admission-letter-sign"><div><strong>Head of School / Authorised Officer</strong><br/>Signature &amp; date</div><div><strong>School Stamp</strong><br/>Official endorsement</div></div>
        </article>
      </div>
    </AppShell>
  );
}
