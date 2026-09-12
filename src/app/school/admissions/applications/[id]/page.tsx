import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { onboardStudentInTransaction } from "@/lib/student-onboarding-service";
import { admissionStatusLabel, appendAdmissionEvent, canTransitionAdmission, getAdmissionApplication, getAdmissionEvents, isAdmissionStatus, type AdmissionStatus } from "@/lib/admissions-v2";
import "../admissions-v2.css";

async function changeAdmissionStatus(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const id = String(formData.get("id") ?? "");
  const toRaw = String(formData.get("to") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id || !isAdmissionStatus(toRaw) || toRaw === "enrolled") throw new Error("Invalid admission status change.");

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `admission-application:${session.schoolId}:${id}`);
    const currentRows = await tx.$queryRawUnsafe<Array<{ status: string; convertedStudentId: string | null }>>(`SELECT "status","convertedStudentId" FROM "AdmissionApplication" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1 FOR UPDATE`, id, session.schoolId);
    const current = currentRows[0];
    if (!current || !isAdmissionStatus(current.status)) throw new Error("Application not found.");
    if (current.convertedStudentId) throw new Error("This application is already enrolled and cannot be reopened.");
    if (!canTransitionAdmission(current.status, toRaw)) throw new Error(`Cannot move an application from ${admissionStatusLabel(current.status)} to ${admissionStatusLabel(toRaw)}.`);
    const timestampField = toRaw === "offered" ? `,"offerIssuedAt"=CURRENT_TIMESTAMP` : toRaw === "accepted" ? `,"acceptedAt"=CURRENT_TIMESTAMP` : "";
    await tx.$executeRawUnsafe(`UPDATE "AdmissionApplication" SET "status"=$1,"decisionNote"=COALESCE($2,"decisionNote"),"updatedAt"=CURRENT_TIMESTAMP${timestampField} WHERE "id"=$3 AND "schoolId"=$4`, toRaw, note, id, session.schoolId);
    await appendAdmissionEvent(tx, { schoolId: session.schoolId, applicationId: id, actorId: session.userId, eventType: `application.${toRaw}`, fromStatus: current.status, toStatus: toRaw, note });
    await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "admission_application.status_changed", entityType: "AdmissionApplication", entityId: id, before: { status: current.status }, after: { status: toRaw, note } });
  });
  revalidatePath(`/school/admissions/applications/${id}`);
  revalidatePath("/school/admissions/applications");
}

async function completeAdmission(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const id = String(formData.get("id") ?? "");
  let studentId = "";
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `admission-application:${session.schoolId}:${id}`);
    const locked = await tx.$queryRawUnsafe<Array<{ status: string; convertedStudentId: string | null }>>(`SELECT "status","convertedStudentId" FROM "AdmissionApplication" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1 FOR UPDATE`, id, session.schoolId);
    if (!locked[0]) throw new Error("Application not found.");
    if (locked[0].convertedStudentId) {
      studentId = locked[0].convertedStudentId;
      return;
    }
    if (locked[0].status !== "accepted") throw new Error("The admission offer must be accepted before the learner can be enrolled.");
    const application = await getAdmissionApplication(tx, session.schoolId, id);
    if (!application?.intendedClassId || !application.academicYearId || !application.termId || !application.admissionDate) throw new Error("Complete the class, academic year, term and admission date before enrolment.");

    const result = await onboardStudentInTransaction(tx, {
      schoolId: session.schoolId,
      actorId: session.userId,
      name: application.studentName,
      dob: application.dob,
      intakeAcademicYearId: application.academicYearId,
      admissionDate: application.admissionDate,
      entryType: application.entryType,
      photoUrl: application.photoData,
      guardian: { name: application.guardianName, phone: application.guardianPhone, relationship: application.guardianRelationship },
      placement: { termId: application.termId, classId: application.intendedClassId, notes: `Confirmed from admission application ${application.reference}.` },
      auditSource: "admissions_v2",
    });
    studentId = result.student.id;
    const changed = await tx.$executeRawUnsafe(`UPDATE "AdmissionApplication" SET "status"='enrolled',"convertedStudentId"=$1,"enrolledAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2 AND "schoolId"=$3 AND "convertedStudentId" IS NULL`, studentId, id, session.schoolId);
    if (changed !== 1) throw new Error("This application was enrolled by another user. Refresh the page.");
    if (application.enquiryId) {
      await tx.$executeRawUnsafe(`UPDATE "AdmissionEnquiry" SET "stage"='converted',"convertedStudentId"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2 AND "schoolId"=$3 AND "convertedStudentId" IS NULL`, studentId, application.enquiryId, session.schoolId);
    }
    await appendAdmissionEvent(tx, { schoolId: session.schoolId, applicationId: id, actorId: session.userId, eventType: "application.enrolled", fromStatus: "accepted", toStatus: "enrolled", note: `Official student record created: ${result.student.admissionNo}` });
    await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "admission_application.enrolled", entityType: "AdmissionApplication", entityId: id, after: { studentId, admissionNo: result.student.admissionNo, enrollmentId: result.enrollmentId } });
  });
  revalidatePath("/school/admissions/applications");
  revalidatePath("/school/students");
  redirect(studentId ? `/school/students/${studentId}` : "/school/students");
}

function transitionButton(status: AdmissionStatus, to: AdmissionStatus, label: string, primary = false) {
  if (!canTransitionAdmission(status, to)) return null;
  return <form action={changeAdmissionStatus}><input type="hidden" name="to" value={to}/><button className={`button ${primary ? "primary" : "secondary"}`} type="submit">{label}</button></form>;
}

export default async function AdmissionApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, application, events] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getAdmissionApplication(tx, session.schoolId, id),
      getAdmissionEvents(tx, session.schoolId, id),
    ]);
    return { school, application, events };
  });
  const application = data.application;
  if (!application) notFound();
  const canWrite = await withTenant(session.schoolId, async (tx) => requirePermission(tx, session.userId, "students:read").then(async () => {
    try { await requirePermission(tx, session.userId, "students:write"); return true; } catch { return false; }
  }));
  const letterReady = ["offered", "accepted", "enrolled"].includes(application.status);

  return (
    <AppShell universe="school" title="Admission application" subtitle={`${application.reference} · ${admissionStatusLabel(application.status)}`} active="Applications" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="admissions-v2">
        <section className="admissions-hero">
          <div><span className="admissions-kicker">{application.reference}</span><h2>{application.studentName}</h2><p>Review the complete application, issue the offer, record acceptance and only then create the official learner record.</p></div>
          <div className="admissions-actions"><Link className="button secondary" href="/school/admissions/applications">← Applications</Link>{letterReady ? <Link className="button primary" href={`/school/admissions/applications/${application.id}/letter`}>Admission letter</Link> : null}</div>
        </section>

        <div className="admission-detail-grid">
          <section className="admissions-card">
            <div className="admissions-card-head"><div><span className="admissions-kicker">Application record</span><h3>Admission details</h3><p><span className="admission-status" data-status={application.status}>{admissionStatusLabel(application.status)}</span></p></div>{application.photoData ? <img className="admission-photo" src={application.photoData} alt={`${application.studentName} admission portrait`} /> : null}</div>
            <div className="admission-details">
              <div className="admission-detail"><span>Learner</span><strong>{application.studentName}</strong></div>
              <div className="admission-detail"><span>Date of birth</span><strong>{application.dob ? new Date(application.dob).toLocaleDateString("en-GH") : "Not recorded"}</strong></div>
              <div className="admission-detail"><span>Guardian</span><strong>{application.guardianName}<br/>{application.guardianPhone}</strong></div>
              <div className="admission-detail"><span>Relationship</span><strong>{application.guardianRelationship}</strong></div>
              <div className="admission-detail"><span>Proposed class</span><strong>{application.classLevel ? `${application.classLevel} · ` : ""}{application.className ?? application.intendedClassName ?? "Not selected"}</strong></div>
              <div className="admission-detail"><span>Academic context</span><strong>{application.academicYearName ?? "—"}<br/>{application.termName ?? "—"}</strong></div>
              <div className="admission-detail"><span>Admission date</span><strong>{application.admissionDate ? new Date(application.admissionDate).toLocaleDateString("en-GH") : "Not recorded"}</strong></div>
              <div className="admission-detail"><span>Entry type</span><strong>{application.entryType}</strong></div>
              <div className="admission-detail"><span>Previous school</span><strong>{application.previousSchool ?? "Not recorded"}</strong></div>
              <div className="admission-detail"><span>Address</span><strong>{application.residentialAddress ?? "Not recorded"}</strong></div>
              <div className="admission-detail"><span>Email</span><strong>{application.guardianEmail ?? "Not recorded"}</strong></div>
              <div className="admission-detail"><span>Internal note</span><strong>{application.decisionNote ?? "No note"}</strong></div>
            </div>
          </section>

          <aside className="admissions-card">
            <div className="admissions-card-head"><div><span className="admissions-kicker">Next decision</span><h3>Admission workflow</h3></div></div>
            <div className="admission-workflow">
              {!canWrite ? <p className="module-muted">You have read-only access to this application.</p> : null}
              {canWrite && application.status === "draft" ? <form action={changeAdmissionStatus}><input type="hidden" name="id" value={application.id}/><input type="hidden" name="to" value="submitted"/><button className="button primary" type="submit">Submit application</button></form> : null}
              {canWrite && application.status === "submitted" ? <form action={changeAdmissionStatus}><input type="hidden" name="id" value={application.id}/><input type="hidden" name="to" value="under_review"/><button className="button secondary" type="submit">Start review</button></form> : null}
              {canWrite && (application.status === "submitted" || application.status === "under_review") ? <form action={changeAdmissionStatus}><input type="hidden" name="id" value={application.id}/><input type="hidden" name="to" value="offered"/><textarea name="note" placeholder="Optional offer / decision note"/><button className="button primary" type="submit">Issue admission offer</button></form> : null}
              {canWrite && application.status === "offered" ? <form action={changeAdmissionStatus}><input type="hidden" name="id" value={application.id}/><input type="hidden" name="to" value="accepted"/><button className="button primary" type="submit">Record offer accepted</button></form> : null}
              {canWrite && application.status === "accepted" ? <form action={completeAdmission}><input type="hidden" name="id" value={application.id}/><button className="button primary" type="submit">Complete admission & enrol student</button><small>This creates the official Student record and confirmed term/class enrolment.</small></form> : null}
              {canWrite && canTransitionAdmission(application.status, "declined") ? <form action={changeAdmissionStatus}><input type="hidden" name="id" value={application.id}/><input type="hidden" name="to" value="declined"/><textarea name="note" required placeholder="Reason / note for declining"/><button className="button secondary" type="submit">Decline application</button></form> : null}
              {letterReady ? <Link className="workflow-link" href={`/school/admissions/applications/${application.id}/letter`}><strong>Admission letter</strong><span>Preview, print, PDF or Word →</span></Link> : <p className="module-muted">The admission letter becomes available after an offer is issued.</p>}
              {application.convertedStudentId ? <Link className="workflow-link" href={`/school/students/${application.convertedStudentId}`}><strong>Official learner record</strong><span>Open student profile →</span></Link> : null}
            </div>
          </aside>
        </div>

        <section className="admissions-card">
          <div className="admissions-card-head"><div><span className="admissions-kicker">Permanent history</span><h3>Admission timeline</h3><p>Every major admission decision is retained here.</p></div></div>
          <div className="admission-timeline">{data.events.length ? data.events.map((event) => <div className="admission-event" key={event.id}><span className="admission-event-dot"/><div><strong>{event.toStatus ? admissionStatusLabel(event.toStatus) : event.eventType.replaceAll(".", " ")}</strong><p>{event.note ?? (event.fromStatus && event.toStatus ? `${admissionStatusLabel(event.fromStatus)} → ${admissionStatusLabel(event.toStatus)}` : "Admission record updated.")}</p><time>{new Date(event.createdAt).toLocaleString("en-GH")} · {event.actorName ?? "System"}</time></div></div>) : <p className="admissions-empty">No history events recorded.</p>}</div>
        </section>
      </div>
    </AppShell>
  );
}
