import { PDFDocument, StandardFonts } from "pdf-lib";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { isSchoolStaffAccount } from "./authorization";
import { requirePermission } from "./rbac";
import { createDocx, createXlsx } from "./ooxml";

export type DossierKind = "student" | "staff";
export type DossierFormat = "pdf" | "docx" | "xlsx" | "csv" | "json";

type DossierTable = { headers: string[]; rows: string[][] };
type DossierSection = {
  title: string;
  note?: string;
  rows?: Array<[string, string]>;
  table?: DossierTable;
};

export type PersonDossier = {
  kind: DossierKind;
  filenameBase: string;
  title: string;
  subtitle: string;
  schoolName: string;
  schoolCode: string;
  generatedAt: string;
  summary: Array<{ label: string; value: string; hint?: string }>;
  sections: DossierSection[];
};

const ZERO = new Prisma.Decimal(0);

function text(value: unknown, fallback = "-") {
  if (value == null || value === "") return fallback;
  return String(value);
}

function date(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Accra" }).format(new Date(value));
}

function dateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" }).format(new Date(value));
}

function money(value: Prisma.Decimal | number | string | null | undefined) {
  return `GHS ${new Prisma.Decimal(String(value ?? 0)).toFixed(2)}`;
}

function safeFile(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "dossier";
}

function paidNet(payments: Array<{ amount: Prisma.Decimal; reversals: Array<{ amount: Prisma.Decimal }> }>) {
  return payments.reduce((sum, payment) => {
    const reversed = payment.reversals.reduce((total, reversal) => total.plus(reversal.amount), ZERO);
    return sum.plus(payment.amount).minus(reversed);
  }, ZERO);
}

function scorePercent(value: Prisma.Decimal, maxScore: Prisma.Decimal) {
  const max = Number(maxScore);
  if (!Number.isFinite(max) || max <= 0) return Number(value);
  return (Number(value) / max) * 100;
}

function trendLabel(valuesNewestFirst: number[]) {
  if (valuesNewestFirst.length < 6) return { label: "Building history", detail: "More results are needed before a recent-performance trend is shown." };
  const recent = valuesNewestFirst.slice(0, 5);
  const previous = valuesNewestFirst.slice(5, 10);
  const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const delta = avg(recent) - avg(previous);
  if (Math.abs(delta) < 2) return { label: "Stable", detail: `Recent normalized scores are ${Math.abs(delta).toFixed(1)} points from the previous window.` };
  return delta > 0
    ? { label: "Improving", detail: `Recent normalized scores are ${delta.toFixed(1)} points above the previous window.` }
    : { label: "Needs attention", detail: `Recent normalized scores are ${Math.abs(delta).toFixed(1)} points below the previous window.` };
}

async function auditExport(tx: TenantDb, schoolId: string, actorId: string, kind: DossierKind, entityId: string, format: DossierFormat) {
  await tx.auditLogSchool.create({
    data: {
      schoolId,
      actorId,
      action: `${kind}.dossier.export`,
      entityType: kind === "student" ? "Student" : "User",
      entityId,
      after: { format, generatedAt: new Date().toISOString() },
    },
  });
}

export async function buildStudentDossier(tx: TenantDb, schoolId: string, actorId: string, studentId: string, format: DossierFormat): Promise<PersonDossier> {
  await requirePermission(tx, actorId, "students:read");
  await requirePermission(tx, actorId, "reports:generate");
  await requirePermission(tx, actorId, "exports:students");

  const student = await tx.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true,
      name: true,
      admissionNo: true,
      dob: true,
      status: true,
      photoUrl: true,
      school: { select: { name: true, uniqueCode: true } },
      class: { select: { name: true, level: true, classTeacher: { select: { name: true } } } },
      house: { select: { name: true, code: true } },
      guardians: {
        select: {
          relationship: true,
          isPrimary: true,
          guardian: { select: { name: true, phone: true, email: true, userId: true, user: { select: { status: true } } } },
        },
      },
      scores: {
        orderBy: { enteredAt: "desc" },
        take: 500,
        select: {
          value: true,
          enteredAt: true,
          assessment: { select: { name: true, type: true, maxScore: true } },
          subject: { select: { name: true } },
        },
      },
      attendanceEvents: {
        orderBy: { timestamp: "desc" },
        take: 300,
        select: { type: true, attendanceDate: true, timestamp: true, method: true, isLate: true },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 250,
        select: {
          id: true,
          totalAmount: true,
          status: true,
          createdAt: true,
          term: { select: { name: true } },
          payments: { select: { amount: true, reversals: { select: { amount: true } } } },
        },
      },
      reportCards: { orderBy: { createdAt: "desc" }, take: 100, select: { id: true, status: true, createdAt: true, term: { select: { name: true } } } },
      identityCards: { orderBy: { createdAt: "desc" }, take: 20, select: { serial: true, status: true, expiresAt: true, createdAt: true } },
    },
  });
  if (!student) throw new AppError("Student dossier not found.", 404, "STUDENT_DOSSIER_NOT_FOUND");

  const [attendanceTotal, lateTotal, checkInTotal, admissionRows] = await Promise.all([
    tx.attendanceEvent.count({ where: { schoolId, studentId } }),
    tx.attendanceEvent.count({ where: { schoolId, studentId, isLate: true } }),
    tx.attendanceEvent.count({ where: { schoolId, studentId, type: "in" } }),
    tx.$queryRawUnsafe<Array<{ reference: string; status: string; entryType: string; admissionDate: Date | null; createdAt: Date }>>(
      `SELECT "reference","status","entryType","admissionDate","createdAt" FROM "AdmissionApplication" WHERE "schoolId"=$1 AND "convertedStudentId"=$2 ORDER BY "createdAt" DESC LIMIT 5`,
      schoolId,
      studentId,
    ),
  ]);

  const percentages = student.scores.map((score) => scorePercent(score.value, score.assessment.maxScore));
  const academicAverage = percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null;
  const trend = trendLabel(percentages);
  const billed = student.invoices.reduce((sum, invoice) => sum.plus(invoice.totalAmount), ZERO);
  const paid = student.invoices.reduce((sum, invoice) => sum.plus(paidNet(invoice.payments)), ZERO);
  const balance = Prisma.Decimal.max(ZERO, billed.minus(paid));
  const primary = student.guardians.find((link) => link.isPrimary)?.guardian ?? student.guardians[0]?.guardian ?? null;

  const dossier: PersonDossier = {
    kind: "student",
    filenameBase: `${safeFile(student.name)}-${safeFile(student.admissionNo)}-student-dossier`,
    title: `${student.name} - Student Dossier`,
    subtitle: `${student.school.name} (${student.school.uniqueCode})`,
    schoolName: student.school.name,
    schoolCode: student.school.uniqueCode,
    generatedAt: new Date().toISOString(),
    summary: [
      { label: "Academic average", value: academicAverage == null ? "-" : `${academicAverage.toFixed(1)}%`, hint: percentages.length ? `${percentages.length} recorded scores` : "No recorded scores" },
      { label: "Recent trend", value: trend.label, hint: trend.detail },
      { label: "Attendance events", value: String(attendanceTotal), hint: `${checkInTotal} check-ins; ${lateTotal} marked late` },
      { label: "Outstanding fees", value: money(balance), hint: `${student.invoices.length} invoices in dossier window` },
      { label: "Guardian readiness", value: primary?.phone ? "Contact ready" : "Needs contact review", hint: primary ? `${primary.name}${primary.phone ? ` - ${primary.phone}` : ""}` : "No guardian linked" },
      { label: "Report cards", value: String(student.reportCards.length), hint: student.reportCards[0] ? `Latest: ${student.reportCards[0].term.name} (${student.reportCards[0].status})` : "None generated" },
    ],
    sections: [
      {
        title: "Learner identity",
        rows: [
          ["Full name", student.name],
          ["Admission / index number", student.admissionNo],
          ["Status", student.status],
          ["Date of birth", date(student.dob)],
          ["Class", student.class ? `${student.class.level ? `${student.class.level} - ` : ""}${student.class.name}` : "Unassigned"],
          ["Class teacher", student.class?.classTeacher?.name ?? "-"],
          ["House", student.house ? `${student.house.name} (${student.house.code})` : "-"],
          ["Official portrait", student.photoUrl ? "On file" : "Not on file"],
        ],
      },
      {
        title: "Intelligence summary",
        note: "These indicators summarize recorded school data. They do not replace teacher, counsellor or leadership judgement.",
        rows: [
          ["Academic average", academicAverage == null ? "-" : `${academicAverage.toFixed(1)}%`],
          ["Recent performance trend", trend.label],
          ["Trend context", trend.detail],
          ["Recorded attendance events", String(attendanceTotal)],
          ["Late events", String(lateTotal)],
          ["Net fees billed", money(billed)],
          ["Net payments", money(paid)],
          ["Outstanding balance", money(balance)],
        ],
      },
      {
        title: "Guardians and family contacts",
        table: {
          headers: ["Guardian", "Relationship", "Primary", "Phone", "Email", "Portal"],
          rows: student.guardians.map((link) => [
            link.guardian.name,
            link.relationship,
            link.isPrimary ? "Yes" : "No",
            text(link.guardian.phone),
            text(link.guardian.email),
            link.guardian.userId ? text(link.guardian.user?.status, "linked") : "No account",
          ]),
        },
      },
      {
        title: "Academic performance history",
        note: "Percentage is normalized against each assessment maximum where available.",
        table: {
          headers: ["Recorded", "Subject", "Assessment", "Type", "Score", "Maximum", "Percent"],
          rows: student.scores.map((score) => [
            date(score.enteredAt),
            score.subject.name,
            score.assessment.name,
            score.assessment.type,
            Number(score.value).toFixed(2),
            Number(score.assessment.maxScore).toFixed(2),
            `${scorePercent(score.value, score.assessment.maxScore).toFixed(1)}%`,
          ]),
        },
      },
      {
        title: "Attendance history",
        table: {
          headers: ["Date", "Time", "Event", "Method", "Late"],
          rows: student.attendanceEvents.map((event) => [date(event.attendanceDate), dateTime(event.timestamp), event.type, event.method, event.isLate ? "Yes" : "No"]),
        },
      },
      {
        title: "Finance history",
        table: {
          headers: ["Created", "Term", "Invoice", "Payable", "Net paid", "Balance", "Status"],
          rows: student.invoices.map((invoice) => {
            const netPaidAmount = paidNet(invoice.payments);
            const invoiceBalance = Prisma.Decimal.max(ZERO, invoice.totalAmount.minus(netPaidAmount));
            return [date(invoice.createdAt), invoice.term.name, invoice.id, money(invoice.totalAmount), money(netPaidAmount), money(invoiceBalance), invoice.status];
          }),
        },
      },
      {
        title: "Admission history",
        table: {
          headers: ["Reference", "Entry type", "Admission date", "Status", "Created"],
          rows: admissionRows.map((row) => [row.reference, row.entryType, date(row.admissionDate), row.status, date(row.createdAt)]),
        },
      },
      {
        title: "Report cards and credentials",
        table: {
          headers: ["Record", "Reference", "Status", "Date / expiry"],
          rows: [
            ...student.reportCards.map((card) => ["Report card", card.term.name, card.status, date(card.createdAt)]),
            ...student.identityCards.map((card) => ["Identity card", card.serial, card.status, date(card.expiresAt ?? card.createdAt)]),
          ],
        },
      },
    ],
  };

  await auditExport(tx, schoolId, actorId, "student", studentId, format);
  return dossier;
}

export async function buildStaffDossier(tx: TenantDb, schoolId: string, actorId: string, staffId: string, format: DossierFormat): Promise<PersonDossier> {
  await requirePermission(tx, actorId, "users:read");
  await requirePermission(tx, actorId, "reports:generate");
  await requirePermission(tx, actorId, "exports:staff");

  const staff = await tx.user.findFirst({
    where: { id: staffId, schoolId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      school: { select: { name: true, uniqueCode: true } },
      userRoles: { select: { role: { select: { name: true, key: true } } } },
      classTeacherFor: { select: { name: true, level: true } },
      subjectAssignments: { select: { subject: { select: { name: true } }, class: { select: { name: true, level: true } } } },
      staffAttendance: { orderBy: { timestamp: "desc" }, take: 300, select: { type: true, attendanceDate: true, timestamp: true, method: true, isLate: true } },
      identityCards: { orderBy: { createdAt: "desc" }, take: 20, select: { serial: true, status: true, expiresAt: true, createdAt: true } },
    },
  });
  if (!staff || !isSchoolStaffAccount(staff.userRoles.map(({ role }) => role))) throw new AppError("Staff dossier not found.", 404, "STAFF_DOSSIER_NOT_FOUND");

  const [attendanceTotal, lateTotal, checkInTotal] = await Promise.all([
    tx.attendanceEvent.count({ where: { schoolId, staffId } }),
    tx.attendanceEvent.count({ where: { schoolId, staffId, isLate: true } }),
    tx.attendanceEvent.count({ where: { schoolId, staffId, type: "in" } }),
  ]);
  const roles = staff.userRoles.map(({ role }) => role.name);
  const distinctClasses = new Set(staff.subjectAssignments.map((assignment) => assignment.class.name));

  const dossier: PersonDossier = {
    kind: "staff",
    filenameBase: `${safeFile(staff.name)}-staff-dossier`,
    title: `${staff.name} - Staff Dossier`,
    subtitle: `${staff.school.name} (${staff.school.uniqueCode})`,
    schoolName: staff.school.name,
    schoolCode: staff.school.uniqueCode,
    generatedAt: new Date().toISOString(),
    summary: [
      { label: "Roles", value: String(roles.length), hint: roles.join(", ") || "No role assigned" },
      { label: "Teaching assignments", value: String(staff.subjectAssignments.length), hint: `${distinctClasses.size} distinct classes` },
      { label: "Class leadership", value: String(staff.classTeacherFor.length), hint: staff.classTeacherFor.map((item) => item.name).join(", ") || "No class leadership" },
      { label: "Attendance events", value: String(attendanceTotal), hint: `${checkInTotal} check-ins; ${lateTotal} marked late` },
      { label: "Account status", value: staff.status, hint: `School account since ${date(staff.createdAt)}` },
      { label: "Identity cards", value: String(staff.identityCards.length), hint: staff.identityCards[0] ? `Latest ${staff.identityCards[0].status}` : "No card history" },
    ],
    sections: [
      {
        title: "Staff identity and access",
        rows: [
          ["Full name", staff.name],
          ["Email", text(staff.email)],
          ["Phone", text(staff.phone)],
          ["Status", staff.status],
          ["Roles", roles.join(", ") || "None assigned"],
          ["Account created", date(staff.createdAt)],
        ],
      },
      {
        title: "Workload intelligence",
        note: "Workload indicators describe configured teaching responsibility only. SukuuNova does not rank staff performance from learner marks.",
        rows: [
          ["Subject/class assignments", String(staff.subjectAssignments.length)],
          ["Distinct assigned classes", String(distinctClasses.size)],
          ["Classes led", String(staff.classTeacherFor.length)],
          ["Recorded attendance events", String(attendanceTotal)],
          ["Late attendance events", String(lateTotal)],
        ],
        table: {
          headers: ["Class", "Level", "Subject"],
          rows: staff.subjectAssignments.map((assignment) => [assignment.class.name, text(assignment.class.level), assignment.subject.name]),
        },
      },
      {
        title: "Class leadership",
        table: {
          headers: ["Class", "Level"],
          rows: staff.classTeacherFor.map((item) => [item.name, text(item.level)]),
        },
      },
      {
        title: "Attendance history",
        table: {
          headers: ["Date", "Time", "Event", "Method", "Late"],
          rows: staff.staffAttendance.map((event) => [date(event.attendanceDate), dateTime(event.timestamp), event.type, event.method, event.isLate ? "Yes" : "No"]),
        },
      },
      {
        title: "Identity credential history",
        table: {
          headers: ["Serial", "Status", "Issued", "Expiry"],
          rows: staff.identityCards.map((card) => [card.serial, card.status, date(card.createdAt), date(card.expiresAt)]),
        },
      },
    ],
  };

  await auditExport(tx, schoolId, actorId, "staff", staffId, format);
  return dossier;
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function dossierCsv(dossier: PersonDossier) {
  const rows: string[] = [];
  rows.push(["SukuuNova dossier", dossier.title].map(csvCell).join(","));
  rows.push(["School", dossier.schoolName].map(csvCell).join(","));
  rows.push(["School code", dossier.schoolCode].map(csvCell).join(","));
  rows.push(["Generated", dossier.generatedAt].map(csvCell).join(","));
  rows.push("");
  rows.push(["Summary", "Value", "Context"].map(csvCell).join(","));
  for (const item of dossier.summary) rows.push([item.label, item.value, item.hint ?? ""].map(csvCell).join(","));
  for (const section of dossier.sections) {
    rows.push("");
    rows.push([section.title].map(csvCell).join(","));
    if (section.note) rows.push(["Note", section.note].map(csvCell).join(","));
    for (const [label, value] of section.rows ?? []) rows.push([label, value].map(csvCell).join(","));
    if (section.table) {
      rows.push(section.table.headers.map(csvCell).join(","));
      for (const row of section.table.rows) rows.push(row.map(csvCell).join(","));
    }
  }
  return `${rows.join("\n")}\n`;
}

function workbookRows(section: DossierSection): Array<Array<string | number | boolean | null | undefined>> {
  const rows: Array<Array<string | number | boolean | null | undefined>> = [];
  if (section.note) rows.push(["Note", section.note]);
  if (section.rows?.length) {
    rows.push(["Field", "Value"]);
    rows.push(...section.rows);
  }
  if (section.table) {
    if (rows.length) rows.push([]);
    rows.push(section.table.headers);
    rows.push(...section.table.rows);
  }
  return rows.length ? rows : [["No records"]];
}

export function dossierXlsx(dossier: PersonDossier) {
  return createXlsx([
    {
      name: "Overview",
      rows: [
        ["SukuuNova dossier", dossier.title],
        ["School", dossier.schoolName],
        ["School code", dossier.schoolCode],
        ["Generated", dossier.generatedAt],
        [],
        ["Indicator", "Value", "Context"],
        ...dossier.summary.map((item) => [item.label, item.value, item.hint ?? ""]),
      ],
    },
    ...dossier.sections.map((section) => ({ name: section.title, rows: workbookRows(section) })),
  ]);
}

export function dossierDocx(dossier: PersonDossier) {
  return createDocx({
    title: dossier.title,
    subtitle: dossier.subtitle,
    generatedAt: dateTime(dossier.generatedAt),
    sections: [
      {
        title: "Executive summary",
        rows: dossier.summary.map((item) => [item.label, `${item.value}${item.hint ? ` - ${item.hint}` : ""}`]),
      },
      ...dossier.sections.map((section) => ({ title: section.title, paragraphs: section.note ? [section.note] : undefined, rows: section.rows, table: section.table })),
    ],
  });
}

function pdfSafe(value: string) {
  return value
    .replaceAll("GH₵", "GHS")
    .replaceAll("₵", "GHS")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("•", "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(value: string, width: number) {
  const words = pdfSafe(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= width) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function dossierPdf(dossier: PersonDossier) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 795;
  const margin = 44;

  const newPage = () => { page = pdf.addPage([595.28, 841.89]); y = 795; };
  const line = (value: string, options?: { size?: number; isBold?: boolean; indent?: number; gap?: number }) => {
    const size = options?.size ?? 9;
    const indent = options?.indent ?? 0;
    const gap = options?.gap ?? 4;
    const width = Math.max(35, Math.floor((507 - indent) / (size * 0.52)));
    for (const wrapped of wrap(value, width)) {
      if (y < 58) newPage();
      page.drawText(wrapped, { x: margin + indent, y, size, font: options?.isBold ? bold : regular });
      y -= size + gap;
    }
  };
  const divider = () => { if (y < 62) newPage(); page.drawLine({ start: { x: margin, y }, end: { x: 551, y }, thickness: 0.5 }); y -= 9; };

  line(dossier.schoolName, { size: 10, isBold: true, gap: 5 });
  line(dossier.title, { size: 18, isBold: true, gap: 8 });
  line(`School code: ${dossier.schoolCode} | Generated: ${dateTime(dossier.generatedAt)}`, { size: 8, gap: 7 });
  divider();
  line("Executive summary", { size: 13, isBold: true, gap: 6 });
  for (const item of dossier.summary) {
    line(`${item.label}: ${item.value}`, { size: 9, isBold: true, gap: 2 });
    if (item.hint) line(item.hint, { size: 8, indent: 10, gap: 4 });
  }

  for (const section of dossier.sections) {
    y -= 7;
    line(section.title, { size: 12, isBold: true, gap: 5 });
    if (section.note) line(section.note, { size: 8, gap: 6 });
    for (const [label, value] of section.rows ?? []) line(`${label}: ${value}`, { size: 8, gap: 3 });
    if (section.table) {
      divider();
      line(section.table.headers.join(" | "), { size: 7.5, isBold: true, gap: 4 });
      for (const row of section.table.rows) line(row.join(" | "), { size: 7.2, gap: 3 });
    }
  }
  return Buffer.from(await pdf.save());
}
