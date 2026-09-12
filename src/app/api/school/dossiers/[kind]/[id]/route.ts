import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { hardenDossierForExport } from "@/lib/dossier-export-hardening";
import {
  buildStaffDossier,
  buildStudentDossier,
  dossierCsv,
  dossierDocx,
  dossierPdf,
  dossierXlsx,
  type DossierFormat,
  type DossierKind,
} from "@/lib/dossier-report";

const kindSchema = z.enum(["student", "staff"]);
const formatSchema = z.enum(["pdf", "docx", "xlsx", "csv", "json"]);

const MIME: Record<DossierFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
};

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { kind: rawKind, id } = await params;
    const kind = kindSchema.parse(rawKind) as DossierKind;
    const url = new URL(request.url);
    const format = formatSchema.parse((url.searchParams.get("format") || "pdf").toLowerCase()) as DossierFormat;

    const dossier = hardenDossierForExport(await withTenant(session.schoolId, async (tx) => kind === "student"
      ? buildStudentDossier(tx, session.schoolId, session.userId, id, format)
      : buildStaffDossier(tx, session.schoolId, session.userId, id, format)));

    let body: BodyInit;
    if (format === "pdf") body = await dossierPdf(dossier);
    else if (format === "docx") body = dossierDocx(dossier);
    else if (format === "xlsx") body = dossierXlsx(dossier);
    else if (format === "csv") body = dossierCsv(dossier);
    else body = JSON.stringify(dossier, null, 2);

    return new NextResponse(body, {
      headers: {
        "content-type": MIME[format],
        "content-disposition": `attachment; filename="${dossier.filenameBase}.${format}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
