import Link from "next/link";
import { redirect } from "next/navigation";
import { createId } from "@paralleldrive/cuid2";
import { randomInt } from "node:crypto";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { selectAcademicTerm } from "@/lib/term-date";
import "./enrolment.css";

const statuses = ["draft", "ready", "confirmed", "withdrawn"] as const;
const entryTypes = ["new", "returning", "transfer"] as const;
type EnrollmentStatus = (typeof statuses)[number];
type EntryType = (typeof entryTypes)[number];

function dateInput(value: FormDataEntryValue | null) {
  return typeof value === "string" && value ? new Date(value) : null;
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function assertChecksComplete(status: EnrollmentStatus, guardianVerified: boolean, documentsReady: boolean, feeReady: boolean) {
  if ((status === "ready" || status === "confirmed") && !(guardianVerified && documentsReady && feeReady)) {
    throw new Error("Guardian, documents and fee checks must all be complete before this enrolment can be made ready or confirmed.");
  }
}

async function createEnrollment(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const academicYearId = String(formData.get("academicYearId") ?? "").trim();
  const termId = String(formData.get("termId") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  const entryType = String(formData.get("entryType") ?? "new") as EntryType;
  const startDate = dateInput(formData.get("startDate"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const guardianVerified = checked(formData, "guardianVerified");
  const documentsReady = checked(formData, "documentsReady");
  const feeReady = checked(formData, "feeReady");

  if (!studentId || !academicYearId || !termId || !classId) throw new Error("Learner, academic year, term and class are required.");
  if (!entryTypes.includes(entryType)) throw new Error("Invalid entry type.");

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`enrollment:${session.schoolId}:${studentId}:${termId}`}))`;

    const [term, schoolClass, student] = await Promise.all([
      tx.term.findFirst({ where: { id: termId, schoolId: session.schoolId, academicYearId }, select: { id: true } }),
      tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true } }),
      tx.student.findFirst({ where: { id: studentId, schoolId: session.schoolId }, select: { id: true } }),
    ]);
    if (!term) throw new Error("The selected term does not belong to the selected academic year.");
    if (!schoolClass) throw new Error("The selected class does not belong to this school.");
    if (!student) throw new Error("Learner not found.");

    const duplicate = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Enrollment"
      WHERE "schoolId"=${session.schoolId} AND "studentId"=${studentId}
        AND "academicYearId"=${academicYearId} AND "termId"=${termId}
      LIMIT 1
    `;
    if (duplicate.length) throw new Error("This learner is already enrolled for the selected term.");

    const status: EnrollmentStatus = guardianVerified && documentsReady && feeReady ? "ready" : "draft";
    const id = createId();
    await tx.$executeRaw`
      INSERT INTO "Enrollment"
        ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","startDate","guardianVerified","documentsReady","feeReady","notes","createdBy")
      VALUES
        (${id},${session.schoolId},${studentId},${academicYearId},${termId},${classId},${status},${entryType},${startDate},${guardianVerified},${documentsReady},${feeReady},${notes},${session.userId})
    `;

    await appendSchoolAudit(tx, {
      schoolId: session.schoolId,
      actorId: session.userId,
      action: "enrollment.created",
      entityType: "Enrollment",
      entityId: id,
      after: { studentId, academicYearId, termId, classId, status, entryType, guardianVerified, documentsReady, feeReady },
    });
  });
  redirect("/school/admissions/enrolment");
}

async function updateEnrollment(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "draft") as EnrollmentStatus;
  const guardianVerified = checked(formData, "guardianVerified");
  const documentsReady = checked(formData, "documentsReady");
  const feeReady = checked(formData, "feeReady");

  if (!id || !statuses.includes(status)) throw new Error("Invalid enrolment update.");
  assertChecksComplete(status, guardianVerified, documentsReady, feeReady);

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    const rows = await tx.$queryRaw<Array<{
      studentId: string;
      classId: string;
      termId: string;
      academicYearId: string;
      status: EnrollmentStatus;
    }>>`
      SELECT "studentId","classId","termId","academicYearId","status"
      FROM "Enrollment"
      WHERE "id"=${id} AND "schoolId"=${session.schoolId}
      LIMIT 1 FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new Error("Enrolment not found.");

    if (row.status === "withdrawn" && status !== "withdrawn") {
      throw new Error("A withdrawn enrolment is historical. Create a new enrolment for a later term instead of reopening it.");
    }
    if (row.status === "confirmed" && status !== "confirmed" && status !== "withdrawn") {
      throw new Error("A confirmed enrolment cannot be moved back to draft or ready. Withdraw it only when the learner truly leaves that term.");
    }

    await tx.$executeRaw`
      UPDATE "Enrollment"
      SET "status"=${status},
          "guardianVerified"=${guardianVerified},
          "documentsReady"=${documentsReady},
          "feeReady"=${feeReady},
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id} AND "schoolId"=${session.schoolId}
    `;

    if (status === "confirmed" && row.status !== "confirmed") {
      const [term, settings, terms] = await Promise.all([
        tx.term.findFirst({ where: { id: row.termId, schoolId: session.schoolId }, select: { id: true, startDate: true, endDate: true, isLocked: true } }),
        tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
        tx.term.findMany({ where: { schoolId: session.schoolId }, select: { id: true, startDate: true, endDate: true, isLocked: true } }),
      ]);
      if (!term) throw new Error("The enrolment term no longer exists.");
      const active = selectAcademicTerm(terms, undefined, new Date(), settings?.timezone ?? "Africa/Accra");
      if (active?.id === row.termId) {
        await tx.student.update({ where: { id: row.studentId }, data: { classId: row.classId, status: "active" } });
      }
    }

    await appendSchoolAudit(tx, {
      schoolId: session.schoolId,
      actorId: session.userId,
      action: "enrollment.updated",
      entityType: "Enrollment",
      entityId: id,
      before: { status: row.status },
      after: { status, guardianVerified, documentsReady, feeReady, classId: row.classId, termId: row.termId },
    });
  });
  redirect("/school/admissions/enrolment");
}

async function convertEnquiryToEnrollment(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const enquiryId = String(formData.get("enquiryId") ?? "").trim();
  const academicYearId = String(formData.get("academicYearId") ?? "").trim();
  const termId = String(formData.get("termId") ?? "").trim();
  const classId = String(formData.get("classId") ?? "").trim();
  if (!enquiryId || !academicYearId || !termId || !classId) throw new Error("Enquiry, academic year, term and class are required.");

  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`admission-enquiry:${session.schoolId}:${enquiryId}`}))`;

    const enquiryRows = await tx.$queryRaw<Array<{
      id: string;
      studentName: string;
      guardianName: string | null;
      phone: string | null;
      convertedStudentId: string | null;
    }>>`
      SELECT "id","studentName","guardianName","phone","convertedStudentId"
      FROM "AdmissionEnquiry"
      WHERE "id"=${enquiryId} AND "schoolId"=${session.schoolId}
      LIMIT 1 FOR UPDATE
    `;
    const enquiry = enquiryRows[0];
    if (!enquiry || enquiry.convertedStudentId) throw new Error("This enquiry is already linked to a learner or no longer exists.");

    const [term, schoolClass] = await Promise.all([
      tx.term.findFirst({ where: { id: termId, schoolId: session.schoolId, academicYearId }, select: { id: true } }),
      tx.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true } }),
    ]);
    if (!term) throw new Error("The selected term does not belong to the selected academic year.");
    if (!schoolClass) throw new Error("The selected class does not belong to this school.");

    let admissionNo = `ADM-${new Date().getFullYear()}-${randomInt(1000, 9999)}`;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const hit = await tx.student.findFirst({ where: { schoolId: session.schoolId, admissionNo }, select: { id: true } });
      if (!hit) break;
      admissionNo = `ADM-${new Date().getFullYear()}-${randomInt(1000, 9999)}`;
    }

    let student;
    try {
      student = await tx.student.create({
        data: { schoolId: session.schoolId, name: enquiry.studentName, admissionNo, classId: null, status: "active" },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new Error("A learner with this index number was just created. Try again.");
      throw error;
    }

    const guardianVerified = Boolean(enquiry.guardianName && enquiry.phone);
    if (enquiry.guardianName && enquiry.phone) {
      const guardian = await tx.guardian.upsert({
        where: { schoolId_phone: { schoolId: session.schoolId, phone: enquiry.phone } },
        update: { name: enquiry.guardianName },
        create: { schoolId: session.schoolId, name: enquiry.guardianName, phone: enquiry.phone },
      });
      await tx.studentGuardian.create({
        data: { schoolId: session.schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent/Guardian", isPrimary: true },
      }).catch(() => undefined);
    }

    const enrollmentId = createId();
    await tx.$executeRaw`
      INSERT INTO "Enrollment"
        ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","notes","createdBy")
      VALUES
        (${enrollmentId},${session.schoolId},${student.id},${academicYearId},${termId},${classId},'draft','new',${guardianVerified},false,false,${`Converted from ${enquiryId}`},${session.userId})
    `;

    const claimed = await tx.$executeRaw`
      UPDATE "AdmissionEnquiry"
      SET "stage"='converted',"convertedStudentId"=${student.id},"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${enquiryId} AND "schoolId"=${session.schoolId} AND "convertedStudentId" IS NULL
    `;
    if (claimed !== 1) throw new Error("This enquiry was just linked to another learner. Refresh to see it.");

    await appendSchoolAudit(tx, {
      schoolId: session.schoolId,
      actorId: session.userId,
      action: "admission_enquiry.enrolled",
      entityType: "Enrollment",
      entityId: enrollmentId,
      after: { enquiryId, studentId: student.id, admissionNo, academicYearId, termId, classId, status: "draft", guardianVerified },
    });
  });
  redirect("/school/admissions/enrolment");
}

type EnrollmentRow = {
  id: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  academicYearId: string;
  academicYearName: string;
  termId: string;
  termName: string;
  classId: string;
  className: string;
  status: EnrollmentStatus;
  entryType: string;
  startDate: Date | null;
  guardianVerified: boolean;
  documentsReady: boolean;
  feeReady: boolean;
  createdAt: Date;
};

type CandidateRow = {
  id: string;
  reference: string;
  studentName: string;
  guardianName: string | null;
  phone: string | null;
  intendedClass: string | null;
  stage: string;
};

export default async function EnrolmentPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, settings, terms, classes, students, enrollments, candidates] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.term.findMany({ where: { schoolId: session.schoolId }, include: { academicYear: true }, orderBy: { startDate: "desc" } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.student.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, admissionNo: true, class: { select: { name: true, level: true } } }, take: 500 }),
      tx.$queryRaw<EnrollmentRow[]>`
        SELECT e."id",e."studentId",s."name" AS "studentName",s."admissionNo",
               e."academicYearId",ay."name" AS "academicYearName",e."termId",t."name" AS "termName",
               e."classId",c."name" AS "className",e."status",e."entryType",e."startDate",
               e."guardianVerified",e."documentsReady",e."feeReady",e."createdAt"
        FROM "Enrollment" e
        JOIN "Student" s ON s."id"=e."studentId" AND s."schoolId"=e."schoolId"
        JOIN "AcademicYear" ay ON ay."id"=e."academicYearId" AND ay."schoolId"=e."schoolId"
        JOIN "Term" t ON t."id"=e."termId" AND t."schoolId"=e."schoolId"
        JOIN "Class" c ON c."id"=e."classId" AND c."schoolId"=e."schoolId"
        WHERE e."schoolId"=${session.schoolId}
        ORDER BY e."createdAt" DESC
        LIMIT 500
      `,
      tx.$queryRaw<CandidateRow[]>`
        SELECT "id","reference","studentName","guardianName","phone","intendedClass","stage"
        FROM "AdmissionEnquiry"
        WHERE "schoolId"=${session.schoolId} AND "convertedStudentId" IS NULL
          AND "stage" IN ('accepted','approved','applied')
        ORDER BY "createdAt" DESC
        LIMIT 100
      `,
    ]);
    return { school, settings, terms, classes, students, enrollments, candidates };
  });

  const timezone = data.settings?.timezone ?? "Africa/Accra";
  const currentTerm = selectAcademicTerm(data.terms, undefined, new Date(), timezone);
  const defaultTerm = currentTerm ?? data.terms.find((term) => term.startDate > new Date()) ?? null;
  const confirmed = data.enrollments.filter((row) => row.status === "confirmed").length;
  const ready = data.enrollments.filter((row) => row.status === "ready").length;
  const draft = data.enrollments.filter((row) => row.status === "draft").length;
  const incomplete = data.enrollments.filter((row) => !(row.guardianVerified && row.documentsReady && row.feeReady)).length;

  return (
    <AppShell
      universe="school"
      title="Enrolment"
      subtitle="Term-by-term learner placement and confirmation."
      active="Enrolment"
      schoolName={data.school?.name ?? "School Workspace"}
      schoolCode={data.school?.uniqueCode ?? ""}
      userName={session.name}
    >
      <div className="enrolment-page">
        <section className="enrolment-hero">
          <div>
            <span className="eyebrow">Admissions · term roster</span>
            <h2>Confirm the right learner in the right class for the right term.</h2>
            <div className="enrolment-context">
              {currentTerm ? <span><b>{currentTerm.academicYear.name}</b> · {currentTerm.name} is active</span> : <span>No single active term today. Choose the intended term explicitly.</span>}
              <Link href="/school/terms">Manage terms →</Link>
            </div>
          </div>
          <div className="enrolment-hero-actions"><Link href="/school/admissions/applications" className="button secondary">Applications</Link><a href="#new-enrollment" className="button primary">+ Enrol learner</a></div>
        </section>

        <section className="enrolment-stats">
          <article><span>Confirmed</span><strong>{confirmed}</strong><small>Official term roster entries</small></article>
          <article><span>Ready</span><strong>{ready}</strong><small>Checks complete; confirmation pending</small></article>
          <article><span>Draft</span><strong>{draft}</strong><small>Still being completed</small></article>
          <article className={incomplete ? "attention" : "good"}><span>Checks outstanding</span><strong>{incomplete}</strong><small>{incomplete ? "Guardian, documents or fees" : "All checks complete"}</small></article>
        </section>

        <section className="enrolment-flow"><div className="section-heading"><div><span className="eyebrow">State model</span><h3>Ready is not the same as confirmed.</h3></div></div><div className="flow-grid"><div><b>01</b><strong>Draft</strong><span>Choose term and class</span></div><div><b>02</b><strong>Complete checks</strong><span>Guardian · documents · fees</span></div><div><b>03</b><strong>Ready</strong><span>Review before committing</span></div><div><b>04</b><strong>Confirmed</strong><span>Official historical roster record</span></div></div></section>

        <section id="new-enrollment" className="module-card">
          <div className="section-heading"><div><span className="eyebrow">New term placement</span><h3>Enrol an existing learner</h3></div></div>
          <form action={createEnrollment} className="module-toolbar">
            <select name="studentId" required defaultValue=""><option value="" disabled>Select learner</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.admissionNo}{student.class?.name ? ` · current ${student.class.name}` : " · currently unplaced"}</option>)}</select>
            <select name="academicYearId" required defaultValue={defaultTerm?.academicYearId ?? ""}><option value="" disabled>Select academic year</option>{[...new Map(data.terms.map((term) => [term.academicYearId, term.academicYear])).values()].map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select>
            <select name="termId" required defaultValue={defaultTerm?.id ?? ""}><option value="" disabled>Select term</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{term.academicYear.name} · {term.name}</option>)}</select>
            <select name="classId" required defaultValue=""><option value="" disabled>Select class</option>{data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}</select>
            <select name="entryType" defaultValue="new"><option value="new">New</option><option value="returning">Returning</option><option value="transfer">Transfer</option></select>
            <input type="date" name="startDate" />
            <label><input type="checkbox" name="guardianVerified" /> Guardian verified</label><label><input type="checkbox" name="documentsReady" /> Documents ready</label><label><input type="checkbox" name="feeReady" /> Fee setup ready</label>
            <input name="notes" placeholder="Notes (optional)" />
            <button className="button primary" type="submit">Save enrolment</button>
          </form>
        </section>

        <section className="enrolment-register">
          <div className="section-heading"><div><span className="eyebrow">Term history</span><h3>Enrolment register</h3></div><div className="register-actions"><Link href="/school/students">Students</Link><Link href="/school/classes">Classes</Link></div></div>
          {data.enrollments.length ? <div className="enrolment-table-wrap"><table className="enrolment-table"><thead><tr><th>Learner</th><th>Period</th><th>Class</th><th>Checks</th><th>Status</th><th>Update</th></tr></thead><tbody>{data.enrollments.map((row) => <tr key={row.id}><td><div className="learner-cell"><span className="avatar">{row.studentName.slice(0, 2).toUpperCase()}</span><div><strong>{row.studentName}</strong><small>{row.admissionNo} · {row.entryType}</small></div></div></td><td>{row.academicYearName}<small>{row.termName}</small></td><td>{row.className}</td><td><div className="check-list"><span>{row.guardianVerified ? "✓" : "○"} Guardian</span><span>{row.documentsReady ? "✓" : "○"} Documents</span><span>{row.feeReady ? "✓" : "○"} Fees</span></div></td><td><span className="app-pill">{row.status}</span></td><td><form action={updateEnrollment} className="enrolment-inline-form"><input type="hidden" name="id" value={row.id} /><label><input type="checkbox" name="guardianVerified" defaultChecked={row.guardianVerified} /> G</label><label><input type="checkbox" name="documentsReady" defaultChecked={row.documentsReady} /> D</label><label><input type="checkbox" name="feeReady" defaultChecked={row.feeReady} /> F</label><select name="status" defaultValue={row.status}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><button className="button secondary" type="submit">Save</button></form></td></tr>)}</tbody></table></div> : <div className="module-empty"><strong>No enrolment records yet.</strong><span>Create the first term placement above.</span></div>}
        </section>

        <section className="module-card">
          <div className="section-heading"><div><span className="eyebrow">Accepted applications</span><h3>Convert an enquiry into a learner draft</h3></div></div>
          {data.candidates.length ? <div className="module-list">{data.candidates.map((candidate) => <form action={convertEnquiryToEnrollment} className="module-list-item" key={candidate.id}><input type="hidden" name="enquiryId" value={candidate.id} /><span><strong>{candidate.studentName}</strong><small>{candidate.reference} · {candidate.guardianName ?? "Guardian not recorded"}{candidate.intendedClass ? ` · requested ${candidate.intendedClass}` : ""}</small></span><select name="academicYearId" required defaultValue={defaultTerm?.academicYearId ?? ""}><option value="" disabled>Year</option>{[...new Map(data.terms.map((term) => [term.academicYearId, term.academicYear])).values()].map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select><select name="termId" required defaultValue={defaultTerm?.id ?? ""}><option value="" disabled>Term</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{term.academicYear.name} · {term.name}</option>)}</select><select name="classId" required defaultValue=""><option value="" disabled>Class</option>{data.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select><button className="button primary" type="submit">Create draft</button></form>)}</div> : <div className="module-empty"><strong>No accepted applications are waiting for conversion.</strong></div>}
        </section>
      </div>
    </AppShell>
  );
}
