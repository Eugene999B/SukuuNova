import { randomInt } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";

export const ADMISSION_STATUSES = ["draft", "submitted", "under_review", "offered", "accepted", "declined", "enrolled"] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

export const ADMISSION_ENTRY_TYPES = ["New enrollment", "Transfer in", "Re-enrollment", "Returning learner"] as const;
export type AdmissionEntryType = (typeof ADMISSION_ENTRY_TYPES)[number];

const transitions: Record<AdmissionStatus, AdmissionStatus[]> = {
  draft: ["submitted", "declined"],
  submitted: ["under_review", "offered", "declined"],
  under_review: ["offered", "declined"],
  offered: ["accepted", "declined"],
  accepted: ["enrolled", "declined"],
  declined: [],
  enrolled: [],
};

export function isAdmissionStatus(value: string): value is AdmissionStatus {
  return (ADMISSION_STATUSES as readonly string[]).includes(value);
}

export function isAdmissionEntryType(value: string): value is AdmissionEntryType {
  return (ADMISSION_ENTRY_TYPES as readonly string[]).includes(value);
}

export function canTransitionAdmission(from: AdmissionStatus, to: AdmissionStatus) {
  return transitions[from].includes(to);
}

export function admissionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted: "Submitted",
    under_review: "Under review",
    offered: "Offer issued",
    accepted: "Accepted",
    declined: "Declined",
    enrolled: "Enrolled",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

export function newAdmissionReference(now = new Date()) {
  return `APP-${now.getUTCFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
}

export async function appendAdmissionEvent(tx: TenantDb, input: {
  schoolId: string;
  applicationId: string;
  actorId?: string | null;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
}) {
  await tx.$executeRawUnsafe(
    `INSERT INTO "AdmissionApplicationEvent" ("id","schoolId","applicationId","eventType","fromStatus","toStatus","note","actorId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    createId(), input.schoolId, input.applicationId, input.eventType, input.fromStatus ?? null, input.toStatus ?? null, input.note?.trim() || null, input.actorId ?? null,
  );
}

export type AdmissionApplicationRow = {
  id: string;
  schoolId: string;
  reference: string;
  enquiryId: string | null;
  studentName: string;
  dob: Date | null;
  gender: string | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  guardianRelationship: string;
  residentialAddress: string | null;
  previousSchool: string | null;
  intendedClassId: string | null;
  intendedClassName: string | null;
  academicYearId: string | null;
  termId: string | null;
  admissionDate: Date | null;
  entryType: AdmissionEntryType;
  photoData: string | null;
  status: AdmissionStatus;
  decisionNote: string | null;
  offerIssuedAt: Date | null;
  acceptedAt: Date | null;
  enrolledAt: Date | null;
  convertedStudentId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  className?: string | null;
  classLevel?: string | null;
  academicYearName?: string | null;
  termName?: string | null;
};

export async function getAdmissionApplication(tx: TenantDb, schoolId: string, id: string) {
  const rows = await tx.$queryRawUnsafe<AdmissionApplicationRow[]>(
    `SELECT a.*, c."name" AS "className", c."level" AS "classLevel", ay."name" AS "academicYearName", t."name" AS "termName"
       FROM "AdmissionApplication" a
       LEFT JOIN "Class" c ON c."id"=a."intendedClassId" AND c."schoolId"=a."schoolId"
       LEFT JOIN "AcademicYear" ay ON ay."id"=a."academicYearId" AND ay."schoolId"=a."schoolId"
       LEFT JOIN "Term" t ON t."id"=a."termId" AND t."schoolId"=a."schoolId"
      WHERE a."id"=$1 AND a."schoolId"=$2
      LIMIT 1`,
    id, schoolId,
  );
  return rows[0] ?? null;
}

export type AdmissionEventRow = {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: Date;
};

export async function getAdmissionEvents(tx: TenantDb, schoolId: string, applicationId: string) {
  return tx.$queryRawUnsafe<AdmissionEventRow[]>(
    `SELECT e."id",e."eventType",e."fromStatus",e."toStatus",e."note",e."actorId",u."name" AS "actorName",e."createdAt"
       FROM "AdmissionApplicationEvent" e
       LEFT JOIN "User" u ON u."id"=e."actorId" AND u."schoolId"=e."schoolId"
      WHERE e."schoolId"=$1 AND e."applicationId"=$2
      ORDER BY e."createdAt" DESC`,
    schoolId, applicationId,
  );
}
