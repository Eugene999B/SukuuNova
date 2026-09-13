import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type YearEndAuthority = {
  termId: string;
  academicYearId: string;
  termName: string;
  isYearEnd: boolean;
  source: "academic_calendar" | "legacy_term_number";
};

export async function resolveYearEndAuthority(
  tx: TenantDb,
  input: { schoolId: string; termId: string; legacyFinalTermNumber: number },
): Promise<YearEndAuthority> {
  const term = await tx.term.findFirst({
    where: { id: input.termId, schoolId: input.schoolId },
    select: { id: true, name: true, academicYearId: true },
  });
  if (!term) throw new AppError("Academic term not found.", 404, "TERM_NOT_FOUND");

  const policies = await tx.$queryRawUnsafe<Array<{ termId: string; isYearEnd: boolean }>>(
    `SELECT "termId","isYearEnd" FROM "AcademicSessionPolicy"
      WHERE "schoolId"=$1 AND "academicYearId"=$2`,
    input.schoolId, term.academicYearId,
  );
  const configuredYearEnd = policies.find((row) => row.isYearEnd);
  if (configuredYearEnd) {
    return {
      termId: term.id,
      academicYearId: term.academicYearId,
      termName: term.name,
      isYearEnd: configuredYearEnd.termId === term.id,
      source: "academic_calendar",
    };
  }

  // Compatibility bridge for legacy years whose AcademicSessionPolicy rows were backfilled
  // without guessing a year-end. New/configured years become authoritative as soon as one
  // session is explicitly marked isYearEnd=true.
  const terms = await tx.term.findMany({
    where: { schoolId: input.schoolId, academicYearId: term.academicYearId },
    orderBy: [{ startDate: "asc" }, { endDate: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const fallback = terms[Math.max(0, input.legacyFinalTermNumber - 1)] ?? null;
  return {
    termId: term.id,
    academicYearId: term.academicYearId,
    termName: term.name,
    isYearEnd: fallback?.id === term.id,
    source: "legacy_term_number",
  };
}
