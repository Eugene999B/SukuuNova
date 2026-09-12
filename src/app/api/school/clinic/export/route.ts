import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { getClinicPatientRecord, type ClinicPatientType } from "@/lib/clinic";
import { requirePermission } from "@/lib/rbac";

const typeSchema = z.enum(["student", "staff"]);
const kindSchema = z.enum(["history", "visit"]);

type Writer = {
  addHeading: (text: string, size?: number) => void;
  addText: (text: string, options?: { bold?: boolean; size?: number; gap?: number }) => void;
  addRule: () => void;
  bytes: () => Promise<Uint8Array>;
};

function safeList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function prettyJson(value: unknown) {
  if (!value) return "Not recorded";
  if (Array.isArray(value)) return value.length ? value.map((item) => typeof item === "object" ? Object.entries(item as Record<string, unknown>).map(([key, v]) => `${key}: ${String(v ?? "")}`).join(" · ") : String(item)).join("; ") : "Not recorded";
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== null && v !== "").map(([key, v]) => `${key}: ${String(v)}`).join(" · ") || "Not recorded";
  return String(value);
}

async function createWriter(title: string, schoolName: string): Promise<Writer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28;
  const height = 841.89;
  const margin = 46;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  function newPage() {
    page = pdf.addPage([width, height]);
    y = height - margin;
    page.drawText(`${schoolName} · SukuuNova Clinic`, { x: margin, y, size: 9, font: bold, color: rgb(0.05, 0.35, 0.24) });
    y -= 22;
  }

  function wrap(text: string, fontSize: number, isBold: boolean) {
    const font = isBold ? bold : regular;
    const max = width - margin * 2;
    const words = text.replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, fontSize) <= max) line = next;
      else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function ensure(lines: number, size: number, gap: number) {
    const needed = lines * (size + 4) + gap;
    if (y - needed < margin) newPage();
  }

  const writer: Writer = {
    addHeading(text, size = 15) {
      const lines = wrap(text, size, true);
      ensure(lines.length, size, 10);
      for (const line of lines) { page.drawText(line, { x: margin, y, size, font: bold, color: rgb(0.06, 0.1, 0.16) }); y -= size + 5; }
      y -= 5;
    },
    addText(text, options = {}) {
      const size = options.size ?? 10.5;
      const gap = options.gap ?? 7;
      const lines = wrap(text || "—", size, Boolean(options.bold));
      ensure(lines.length, size, gap);
      for (const line of lines) { page.drawText(line, { x: margin, y, size, font: options.bold ? bold : regular, color: rgb(0.19, 0.24, 0.31) }); y -= size + 4; }
      y -= gap;
    },
    addRule() {
      ensure(1, 2, 12);
      page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.7, color: rgb(0.85, 0.88, 0.91) });
      y -= 14;
    },
    bytes: () => pdf.save(),
  };

  page.drawText(schoolName, { x: margin, y, size: 11, font: bold, color: rgb(0.05, 0.35, 0.24) });
  y -= 24;
  writer.addHeading(title, 22);
  return writer;
}

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const kind = kindSchema.parse(url.searchParams.get("kind") ?? "history");
    const type = typeSchema.parse(url.searchParams.get("type")) as ClinicPatientType;
    const patientId = z.string().min(8).max(128).parse(url.searchParams.get("id"));
    const visitId = url.searchParams.get("visit");

    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "clinic:export");
      const [school, record] = await Promise.all([
        tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true } }),
        getClinicPatientRecord(tx, type, patientId),
      ]);
      if (!school) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");

      if (kind === "visit") {
        const visit = record.visits.find((item) => item.id === visitId);
        if (!visit) throw new AppError("Clinic visit not found.", 404, "CLINIC_VISIT_NOT_FOUND");
        const writer = await createWriter("Clinic Visit & Parent Health Note", school.name);
        writer.addText(`Patient: ${record.identity.name}`, { bold: true, size: 12 });
        writer.addText(`${record.identity.secondary ?? type} · ${record.identity.identifier}`);
        writer.addText(`Date: ${new Date(visit.startedAt).toLocaleString("en-GH", { timeZone: "Africa/Accra", dateStyle: "long", timeStyle: "short" })}`);
        writer.addRule();
        writer.addHeading("Visit summary");
        writer.addText(`Reason seen: ${visit.complaint}`);
        writer.addText(`Vitals: ${prettyJson(visit.vitals)}`);
        writer.addText(`Tests: ${prettyJson(visit.tests)}`);
        writer.addText(`Assessment: ${visit.assessment || "Not recorded"}`);
        writer.addText(`Treatment / action: ${visit.treatment || "Not recorded"}`);
        writer.addText(`Medication: ${prettyJson(visit.prescriptions)}`);
        writer.addText(`Disposition: ${visit.disposition.replaceAll("_", " ")}`);
        if (visit.referralFacility || visit.referralReason) writer.addText(`Referral: ${[visit.referralFacility, visit.referralReason].filter(Boolean).join(" · ")}`);
        if (visit.followUpAt) writer.addText(`Follow-up: ${new Date(visit.followUpAt).toLocaleString("en-GH", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" })}`);
        writer.addRule();
        writer.addHeading("Advice for parent / guardian");
        writer.addText(visit.parentAdvice || "No additional parent/guardian advice was recorded for this visit.");
        writer.addText(`Recorded by: ${visit.nurseName}`);
        writer.addText("This document reflects the school clinic record at the time it was generated and is not a substitute for external medical care when further assessment is needed.", { size: 9 });
        const bytes = await writer.bytes();
        await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "clinic.visit.exported", entityType: "ClinicVisit", entityId: visit.id, after: { patientType: type, patientId } } });
        return { bytes, filename: `${record.identity.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "patient"}-clinic-visit.pdf` };
      }

      const writer = await createWriter("Complete Clinic Health History", school.name);
      writer.addText(`Patient: ${record.identity.name}`, { bold: true, size: 12 });
      writer.addText(`${record.identity.secondary ?? type} · ${record.identity.identifier}`);
      writer.addText(`Generated: ${new Date().toLocaleString("en-GH", { timeZone: "Africa/Accra", dateStyle: "long", timeStyle: "short" })}`);
      writer.addRule();
      writer.addHeading("Health profile");
      writer.addText(`Blood group: ${record.profile?.bloodGroup || "Not recorded"}`);
      writer.addText(`Allergies: ${safeList(record.profile?.allergies).join(", ") || "None recorded"}`);
      writer.addText(`Conditions: ${safeList(record.profile?.conditions).join(", ") || "None recorded"}`);
      writer.addText(`Current medication: ${safeList(record.profile?.currentMedications).join(", ") || "None recorded"}`);
      if (record.profile?.emergencyNotes) writer.addText(`Emergency note: ${record.profile.emergencyNotes}`);
      writer.addRule();
      writer.addHeading(`Clinic timeline · ${record.visits.length} visit${record.visits.length === 1 ? "" : "s"}`);
      if (!record.visits.length) writer.addText("No clinic visits have been recorded.");
      for (const visit of record.visits) {
        writer.addText(new Date(visit.startedAt).toLocaleString("en-GH", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" }), { bold: true, size: 11, gap: 3 });
        writer.addText(`Complaint: ${visit.complaint}`, { gap: 3 });
        writer.addText(`Vitals: ${prettyJson(visit.vitals)}`, { gap: 3 });
        writer.addText(`Tests: ${prettyJson(visit.tests)}`, { gap: 3 });
        writer.addText(`Assessment: ${visit.assessment || "Not recorded"}`, { gap: 3 });
        writer.addText(`Treatment: ${visit.treatment || "Not recorded"}`, { gap: 3 });
        writer.addText(`Medication: ${prettyJson(visit.prescriptions)}`, { gap: 3 });
        writer.addText(`Disposition: ${visit.disposition.replaceAll("_", " ")} · Recorded by ${visit.nurseName}`, { gap: 8 });
        writer.addRule();
      }
      const bytes = await writer.bytes();
      await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "clinic.health_history.exported", entityType: type === "student" ? "Student" : "User", entityId: patientId, after: { visitCount: record.visits.length } } });
      return { bytes, filename: `${record.identity.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "patient"}-health-history.pdf` };
    });

    return new Response(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
