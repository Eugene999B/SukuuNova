import type { TenantDb } from "./db";
import { AppError } from "./errors";

type EvidenceSource = "enrollment" | "score_history" | "report_snapshot" | "invoice_history" | "current_projection";

export type StudentTermClassContext = {
  schoolId: string;
  studentId: string;
  termId: string;
  academicYearId: string;
  classId: string;
  source: EvidenceSource;
  enrollmentStatus: string | null;
};

type EnrollmentRow = { classId: string; status: string };
type ClassEvidenceRow = { classId: string };

function oneClass(rows: ClassEvidenceRow[], code: string): string | null {
  const values = [...new Set(rows.map((row) => row.classId).filter(Boolean))];
  if (values.length > 1) {
    throw new AppError("Conflicting historical class evidence exists for this learner and term. Resolve the enrolment record before continuing.", 409, code);
  }
  return values[0] ?? null;
}

/**
 * Resolve the learner's class for a specific academic term.
 *
 * Canonical order:
 *  1. Enrollment row (ready/confirmed) for the exact student/year/term.
 *  2. Existing score -> assessment class evidence for legacy terms.
 *  3. Frozen report-card snapshot classId for already-generated reports.
 *  4. Existing class-specific invoice lines for legacy finance history.
 *  5. Student.classId only as a compatibility projection when no historical evidence exists.
 *
 * Draft enrolments are intentionally not historical truth. Strict writers reject them;
 * read-only compatibility resolution may continue to stronger legacy evidence instead.
 */
export async function resolveStudentTermClass(
  tx: TenantDb,
  input: { schoolId: string; studentId: string; termId: string; requireOfficialEnrollment?: boolean },
): Promise<StudentTermClassContext> {
  const [term, student] = await Promise.all([
    tx.term.findFirst({ where: { id: input.termId, schoolId: input.schoolId }, select: { id: true, academicYearId: true } }),
    tx.student.findFirst({ where: { id: input.studentId, schoolId: input.schoolId }, select: { id: true, classId: true } }),
  ]);
  if (!term) throw new AppError("The selected term does not belong to this school.", 404, "TERM_NOT_FOUND");
  if (!student) throw new AppError("Learner not found in this school.", 404, "STUDENT_NOT_FOUND");

  const enrollments = await tx.$queryRawUnsafe<EnrollmentRow[]>(
    `SELECT "classId","status"
       FROM "Enrollment"
      WHERE "schoolId"=$1 AND "studentId"=$2 AND "academicYearId"=$3 AND "termId"=$4
      LIMIT 1`,
    input.schoolId,
    input.studentId,
    term.academicYearId,
    input.termId,
  );
  const enrollment = enrollments[0] ?? null;
  if (enrollment && ["ready", "confirmed"].includes(enrollment.status)) {
    return {
      schoolId: input.schoolId,
      studentId: input.studentId,
      termId: input.termId,
      academicYearId: term.academicYearId,
      classId: enrollment.classId,
      source: "enrollment",
      enrollmentStatus: enrollment.status,
    };
  }
  if (enrollment?.status === "withdrawn" && input.requireOfficialEnrollment) {
    throw new AppError("This learner is withdrawn from the selected term.", 409, "TERM_ENROLLMENT_WITHDRAWN");
  }
  if (enrollment?.status === "draft" && input.requireOfficialEnrollment) {
    throw new AppError("This learner's enrolment is still a draft for the selected term.", 409, "TERM_ENROLLMENT_NOT_READY");
  }

  const scoreClassId = oneClass(await tx.$queryRawUnsafe<ClassEvidenceRow[]>(
    `SELECT DISTINCT a."classId"
       FROM "Score" s
       JOIN "Assessment" a ON a."id"=s."assessmentId" AND a."schoolId"=s."schoolId"
      WHERE s."schoolId"=$1 AND s."studentId"=$2 AND a."termId"=$3`,
    input.schoolId,
    input.studentId,
    input.termId,
  ), "AMBIGUOUS_SCORE_CLASS_HISTORY");
  if (scoreClassId) {
    return { schoolId: input.schoolId, studentId: input.studentId, termId: input.termId, academicYearId: term.academicYearId, classId: scoreClassId, source: "score_history", enrollmentStatus: enrollment?.status ?? null };
  }

  const snapshotClassId = oneClass(await tx.$queryRawUnsafe<ClassEvidenceRow[]>(
    `SELECT DISTINCT ("calculationSnapshot"->>'classId') AS "classId"
       FROM "ReportCard"
      WHERE "schoolId"=$1 AND "studentId"=$2 AND "termId"=$3
        AND "calculationSnapshot" IS NOT NULL
        AND NULLIF("calculationSnapshot"->>'classId','') IS NOT NULL`,
    input.schoolId,
    input.studentId,
    input.termId,
  ), "AMBIGUOUS_REPORT_CLASS_HISTORY");
  if (snapshotClassId) {
    return { schoolId: input.schoolId, studentId: input.studentId, termId: input.termId, academicYearId: term.academicYearId, classId: snapshotClassId, source: "report_snapshot", enrollmentStatus: enrollment?.status ?? null };
  }

  const invoiceClassId = oneClass(await tx.$queryRawUnsafe<ClassEvidenceRow[]>(
    `SELECT DISTINCT fi."classId"
       FROM "Invoice" i
       JOIN "InvoiceLine" il ON il."invoiceId"=i."id" AND il."schoolId"=i."schoolId"
       JOIN "FeeItem" fi ON fi."id"=il."feeItemId" AND fi."schoolId"=il."schoolId"
      WHERE i."schoolId"=$1 AND i."studentId"=$2 AND i."termId"=$3 AND fi."classId" IS NOT NULL`,
    input.schoolId,
    input.studentId,
    input.termId,
  ), "AMBIGUOUS_INVOICE_CLASS_HISTORY");
  if (invoiceClassId) {
    return { schoolId: input.schoolId, studentId: input.studentId, termId: input.termId, academicYearId: term.academicYearId, classId: invoiceClassId, source: "invoice_history", enrollmentStatus: enrollment?.status ?? null };
  }

  if (!student.classId) throw new AppError("This learner has no class context for the selected term.", 409, "TERM_CLASS_NOT_FOUND");
  if (input.requireOfficialEnrollment) {
    throw new AppError("Confirm this learner's enrolment for the selected term before creating new term-bound records.", 409, "TERM_ENROLLMENT_REQUIRED");
  }
  return {
    schoolId: input.schoolId,
    studentId: input.studentId,
    termId: input.termId,
    academicYearId: term.academicYearId,
    classId: student.classId,
    source: "current_projection",
    enrollmentStatus: enrollment?.status ?? null,
  };
}

export async function resolveTermRoster(
  tx: TenantDb,
  input: { schoolId: string; termId: string; studentIds?: string[]; requireOfficialEnrollment?: boolean },
) {
  const students = await tx.student.findMany({
    where: { schoolId: input.schoolId, status: "active", ...(input.studentIds?.length ? { id: { in: input.studentIds } } : {}) },
    select: { id: true, name: true, admissionNo: true, classId: true },
    orderBy: { id: "asc" },
  });
  const rows = [];
  for (const student of students) {
    try {
      const context = await resolveStudentTermClass(tx, {
        schoolId: input.schoolId,
        studentId: student.id,
        termId: input.termId,
        requireOfficialEnrollment: input.requireOfficialEnrollment,
      });
      rows.push({ ...student, termClassId: context.classId, classSource: context.source, enrollmentStatus: context.enrollmentStatus });
    } catch (error) {
      if (error instanceof AppError && ["TERM_CLASS_NOT_FOUND", "TERM_ENROLLMENT_REQUIRED", "TERM_ENROLLMENT_NOT_READY", "TERM_ENROLLMENT_WITHDRAWN"].includes(error.code)) {
        rows.push({ ...student, termClassId: null, classSource: null, enrollmentStatus: null });
      } else {
        throw error;
      }
    }
  }
  return rows;
}
