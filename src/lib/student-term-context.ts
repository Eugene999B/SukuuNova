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
 *  5. Student.classId only when a caller explicitly opts out of official context.
 *
 * Safe-by-default: term-bound callers require official enrolment or strong legacy
 * evidence. Draft/withdrawn enrolments block operational use. Compatibility code
 * must explicitly pass requireOfficialEnrollment:false before current projection
 * is allowed.
 */
export async function resolveStudentTermClass(
  tx: TenantDb,
  input: { schoolId: string; studentId: string; termId: string; requireOfficialEnrollment?: boolean },
): Promise<StudentTermClassContext> {
  const requireOfficialEnrollment = input.requireOfficialEnrollment ?? true;
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
  if (enrollment?.status === "withdrawn" && requireOfficialEnrollment) {
    throw new AppError("This learner is withdrawn from the selected term.", 409, "TERM_ENROLLMENT_WITHDRAWN");
  }
  if (enrollment?.status === "draft" && requireOfficialEnrollment) {
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
  if (requireOfficialEnrollment) {
    throw new AppError("Confirm this learner's enrolment for the selected term before creating or reading term-bound records.", 409, "TERM_ENROLLMENT_REQUIRED");
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


type RosterInput = { schoolId: string; termId: string; studentIds?: string[]; requireOfficialEnrollment?: boolean; includeInactive?: boolean };
type RosterEvidence = { studentId: string; classId: string; source: "enrollment" | "score_history" | "report_snapshot" | "invoice_history"; status: string | null };

async function loadTermRoster(tx: TenantDb, input: RosterInput) {
  const [term, students] = await Promise.all([
    tx.term.findFirst({ where: { id: input.termId, schoolId: input.schoolId }, select: { academicYearId: true } }),
    tx.student.findMany({
      where: { schoolId: input.schoolId, ...(!input.includeInactive ? { status: "active" } : {}), ...(input.studentIds ? { id: { in: input.studentIds } } : {}) },
      select: { id: true, name: true, admissionNo: true, classId: true },
      orderBy: { id: "asc" },
    }),
  ]);
  if (!term) throw new AppError("The selected term does not belong to this school.", 404, "TERM_NOT_FOUND");
  if (!students.length) return [];
  // Three database reads regardless of roster size. Evidence precedence matches
  // resolveStudentTermClass; never infer historical enrolment from today's class.
  const evidence = await tx.$queryRawUnsafe<RosterEvidence[]>(
    `SELECT "studentId", "classId", 'enrollment' AS source, status
       FROM "Enrollment" WHERE "schoolId"=$1 AND "termId"=$2 AND "academicYearId"=$3
     UNION ALL
     SELECT DISTINCT s."studentId", a."classId", 'score_history', NULL
       FROM "Score" s JOIN "Assessment" a ON a.id=s."assessmentId" AND a."schoolId"=s."schoolId"
       WHERE s."schoolId"=$1 AND a."termId"=$2
     UNION ALL
     SELECT DISTINCT "studentId", "calculationSnapshot"->>'classId', 'report_snapshot', NULL
       FROM "ReportCard" WHERE "schoolId"=$1 AND "termId"=$2 AND NULLIF("calculationSnapshot"->>'classId','') IS NOT NULL
     UNION ALL
     SELECT DISTINCT i."studentId", f."classId", 'invoice_history', NULL
       FROM "Invoice" i JOIN "InvoiceLine" l ON l."invoiceId"=i.id AND l."schoolId"=i."schoolId"
       JOIN "FeeItem" f ON f.id=l."feeItemId" AND f."schoolId"=l."schoolId"
       WHERE i."schoolId"=$1 AND i."termId"=$2 AND f."classId" IS NOT NULL`,
    input.schoolId, input.termId, term.academicYearId,
  );
  const byStudent = new Map<string, RosterEvidence[]>();
  for (const row of evidence) {
    const rows = byStudent.get(row.studentId) ?? [];
    rows.push(row);
    byStudent.set(row.studentId, rows);
  }
  return students.map(student => {
    const rows = byStudent.get(student.id) ?? [];
    const enrollment = rows.find(row => row.source === "enrollment");
    const empty = { ...student, termClassId: null, classSource: null, enrollmentStatus: null };
    if (enrollment && ["ready", "confirmed"].includes(enrollment.status ?? "")) {
      return { ...student, termClassId: enrollment.classId, classSource: "enrollment" as EvidenceSource, enrollmentStatus: enrollment.status };
    }
    if ((input.requireOfficialEnrollment ?? true) && ["withdrawn", "draft"].includes(enrollment?.status ?? "")) return empty;
    const sources = [
      ["score_history", "AMBIGUOUS_SCORE_CLASS_HISTORY"],
      ["report_snapshot", "AMBIGUOUS_REPORT_CLASS_HISTORY"],
      ["invoice_history", "AMBIGUOUS_INVOICE_CLASS_HISTORY"],
    ] as const;
    for (const [source, code] of sources) {
      const classId = oneClass(rows.filter(row => row.source === source), code);
      if (classId) return { ...student, termClassId: classId, classSource: source as EvidenceSource, enrollmentStatus: enrollment?.status ?? null };
    }
    if (input.requireOfficialEnrollment === false && student.classId) {
      return { ...student, termClassId: student.classId, classSource: "current_projection" as EvidenceSource, enrollmentStatus: enrollment?.status ?? null };
    }
    return empty;
  });
}

// Share only simultaneous reads. Never retain results after a write can occur in
// the same transaction, and never share a roster between tenant transactions.
const pendingRosters = new WeakMap<TenantDb, Map<string, Promise<Awaited<ReturnType<typeof loadTermRoster>>>>>();
export async function resolveTermRoster(tx: TenantDb, input: RosterInput) {
  let pending = pendingRosters.get(tx);
  if (!pending) { pending = new Map(); pendingRosters.set(tx, pending); }
  const key = JSON.stringify([input.schoolId, input.termId, input.requireOfficialEnrollment ?? true, input.includeInactive ?? false, input.studentIds ? [...input.studentIds].sort() : null]);
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = loadTermRoster(tx, input);
  pending.set(key, promise);
  try { return await promise; } finally { pending.delete(key); }
}

export function reportSnapshotClassId(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = (snapshot as Record<string, unknown>).classId;
  return typeof value === "string" && value.trim() ? value : null;
}
