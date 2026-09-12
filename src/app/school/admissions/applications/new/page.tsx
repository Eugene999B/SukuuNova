import { createId } from "@paralleldrive/cuid2";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { assertPortraitVerificationToken } from "@/lib/portrait-verification";
import { appendAdmissionEvent, isAdmissionEntryType, newAdmissionReference } from "@/lib/admissions-v2";
import { NewAdmissionForm, type AdmissionFormState } from "./NewAdmissionForm";
import "../admissions-v2.css";

function parseDate(value: string, label: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be a valid calendar date.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} must be a valid calendar date.`);
  return date;
}

async function createAdmissionApplication(_state: AdmissionFormState, formData: FormData): Promise<AdmissionFormState> {
  "use server";
  const session = await requireSchoolSession();
  let applicationId = "";
  try {
    applicationId = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "students:write");
      const studentName = String(formData.get("studentName") ?? "").trim();
      const guardianName = String(formData.get("guardianName") ?? "").trim();
      const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();
      const guardianEmail = String(formData.get("guardianEmail") ?? "").trim().toLowerCase() || null;
      const guardianRelationship = String(formData.get("guardianRelationship") ?? "Parent/Guardian").trim() || "Parent/Guardian";
      const gender = String(formData.get("gender") ?? "").trim() || null;
      const residentialAddress = String(formData.get("residentialAddress") ?? "").trim() || null;
      const previousSchool = String(formData.get("previousSchool") ?? "").trim() || null;
      const intendedClassId = String(formData.get("intendedClassId") ?? "").trim();
      const academicYearId = String(formData.get("academicYearId") ?? "").trim();
      const termId = String(formData.get("termId") ?? "").trim();
      const admissionDate = parseDate(String(formData.get("admissionDate") ?? "").trim(), "Admission date");
      const dob = parseDate(String(formData.get("dob") ?? "").trim(), "Date of birth");
      const entryTypeRaw = String(formData.get("entryType") ?? "New enrollment");
      const decisionNote = String(formData.get("decisionNote") ?? "").trim() || null;
      const enquiryId = String(formData.get("enquiryId") ?? "").trim() || null;
      const photoData = String(formData.get("photoData") ?? "").trim() || null;
      const photoVerificationToken = String(formData.get("photoVerificationToken") ?? "").trim();
      const status = String(formData.get("intent") ?? "submit") === "draft" ? "draft" : "submitted";

      if (!studentName) throw new Error("Learner full name is required.");
      if (!guardianName || !guardianPhone) throw new Error("Guardian name and phone number are required.");
      if (!intendedClassId || !academicYearId || !termId || !admissionDate) throw new Error("Class, academic year, entry term and proposed admission date are required.");
      if (!isAdmissionEntryType(entryTypeRaw)) throw new Error("Choose a valid entry type.");
      if (dob && dob > new Date()) throw new Error("Date of birth cannot be in the future.");
      if (photoData) assertPortraitVerificationToken({ token: photoVerificationToken, schoolId: session.schoolId, target: "student", image: photoData });

      const [schoolClass, year, term] = await Promise.all([
        tx.class.findFirst({ where: { id: intendedClassId, schoolId: session.schoolId }, select: { id: true, name: true, level: true } }),
        tx.academicYear.findFirst({ where: { id: academicYearId, schoolId: session.schoolId }, select: { id: true, name: true, startDate: true, endDate: true } }),
        tx.term.findFirst({ where: { id: termId, schoolId: session.schoolId }, select: { id: true, name: true, academicYearId: true, startDate: true, endDate: true, isLocked: true } }),
      ]);
      if (!schoolClass) throw new Error("The selected class no longer exists.");
      if (!year) throw new Error("The selected academic year no longer exists.");
      if (!term || term.academicYearId !== year.id) throw new Error("The selected term does not belong to the chosen academic year.");
      if (term.isLocked) throw new Error("The selected term is locked. Choose an open term.");
      if (admissionDate < year.startDate || admissionDate > year.endDate) throw new Error(`Admission date must fall inside ${year.name}.`);

      if (enquiryId) {
        const enquiry = await tx.$queryRawUnsafe<Array<{ id: string; convertedStudentId: string | null }>>(
          `SELECT "id","convertedStudentId" FROM "AdmissionEnquiry" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, enquiryId, session.schoolId,
        );
        if (!enquiry[0]) throw new Error("The linked enquiry could not be found.");
        if (enquiry[0].convertedStudentId) throw new Error("This enquiry has already been enrolled.");
      }

      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `admission-application:${session.schoolId}`);
      let reference = newAdmissionReference();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const exists = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "AdmissionApplication" WHERE "schoolId"=$1 AND "reference"=$2 LIMIT 1`, session.schoolId, reference);
        if (!exists.length) break;
        reference = newAdmissionReference();
      }
      const id = createId();
      await tx.$executeRawUnsafe(
        `INSERT INTO "AdmissionApplication" ("id","schoolId","reference","enquiryId","studentName","dob","gender","guardianName","guardianPhone","guardianEmail","guardianRelationship","residentialAddress","previousSchool","intendedClassId","intendedClassName","academicYearId","termId","admissionDate","entryType","photoData","status","decisionNote","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        id, session.schoolId, reference, enquiryId, studentName, dob, gender, guardianName, guardianPhone, guardianEmail, guardianRelationship, residentialAddress, previousSchool, schoolClass.id, `${schoolClass.level ? `${schoolClass.level} · ` : ""}${schoolClass.name}`, year.id, term.id, admissionDate, entryTypeRaw, photoData, status, decisionNote, session.userId,
      );
      await appendAdmissionEvent(tx, { schoolId: session.schoolId, applicationId: id, actorId: session.userId, eventType: status === "draft" ? "application.saved" : "application.submitted", toStatus: status, note: decisionNote });
      if (enquiryId) {
        await tx.$executeRawUnsafe(`UPDATE "AdmissionEnquiry" SET "stage"='applied',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1 AND "schoolId"=$2 AND "stage" <> 'converted'`, enquiryId, session.schoolId);
      }
      await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "admission_application.created", entityType: "AdmissionApplication", entityId: id, after: { reference, studentName, status, classId: schoolClass.id, academicYearId: year.id, termId: term.id, enquiryId } } });
      return id;
    });
  } catch (error) {
    console.error("Admission application creation failed", error);
    return { message: error instanceof Error && error.message ? error.message : "The application could not be saved. Nothing was changed." };
  }

  revalidatePath("/school/admissions/applications");
  redirect(`/school/admissions/applications/${applicationId}`);
}

export default async function NewAdmissionPage({ searchParams }: { searchParams: Promise<{ enquiryId?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    const [school, classes, years, terms] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ where: { schoolId: session.schoolId }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
      tx.academicYear.findMany({ where: { schoolId: session.schoolId }, orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true } }),
      tx.term.findMany({ where: { schoolId: session.schoolId }, include: { academicYear: { select: { name: true } } }, orderBy: { startDate: "desc" } }),
    ]);
    let prefill: { enquiryId?: string; studentName?: string; guardianName?: string; guardianPhone?: string; guardianEmail?: string; intendedClass?: string } = {};
    if (params.enquiryId) {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; studentName: string; guardianName: string | null; phone: string | null; email: string | null; intendedClass: string | null; convertedStudentId: string | null }>>(
        `SELECT "id","studentName","guardianName","phone","email","intendedClass","convertedStudentId" FROM "AdmissionEnquiry" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, params.enquiryId, session.schoolId,
      );
      const enquiry = rows[0];
      if (enquiry && !enquiry.convertedStudentId) prefill = { enquiryId: enquiry.id, studentName: enquiry.studentName, guardianName: enquiry.guardianName ?? "", guardianPhone: enquiry.phone ?? "", guardianEmail: enquiry.email ?? "", intendedClass: enquiry.intendedClass ?? "" };
    }
    const now = new Date();
    return {
      school,
      classes,
      years: years.map((year) => ({ id: year.id, name: year.name, startDate: year.startDate.toISOString(), endDate: year.endDate.toISOString(), isCurrent: year.startDate <= now && year.endDate >= now })),
      terms: terms.map((term) => ({ id: term.id, name: term.name, academicYearId: term.academicYearId, academicYearName: term.academicYear.name, isLocked: term.isLocked, isCurrent: term.startDate <= now && term.endDate >= now })),
      prefill,
    };
  });

  return (
    <AppShell universe="school" title="New admission" subtitle="Application → offer → acceptance → official enrolment" active="Applications" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="admissions-v2">
        <section className="admissions-hero"><div><span className="admissions-kicker">Admissions V2</span><h2>Build the admission record before creating the student.</h2><p>This application collects the family, academic placement and portrait first. The learner only becomes part of the official Student register after an accepted application is enrolled.</p></div></section>
        {!data.classes.length || !data.years.length || !data.terms.length ? <div className="app-alert warning">Create at least one class, academic year and term before starting admissions.</div> : <NewAdmissionForm classes={data.classes} academicYears={data.years} terms={data.terms} prefill={data.prefill} action={createAdmissionApplication} />}
      </div>
    </AppShell>
  );
}
