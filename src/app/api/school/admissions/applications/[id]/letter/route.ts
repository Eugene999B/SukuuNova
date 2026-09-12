import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { getAdmissionApplication } from "@/lib/admissions-v2";
import { buildAdmissionPdf, buildAdmissionWord, safeAdmissionLetterFilename } from "@/lib/admission-letter";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "word" ? "word" : "pdf";

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, application] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } }),
      getAdmissionApplication(tx, session.schoolId, id),
    ]);
    return { school, application };
  });

  if (!data.school || !data.application || !["offered", "accepted", "enrolled"].includes(data.application.status)) {
    return new Response("Admission letter not available.", { status: 404 });
  }

  const base = safeAdmissionLetterFilename(`${data.application.reference}-${data.application.studentName}`);
  if (format === "word") {
    const html = buildAdmissionWord({ school: data.school, application: data.application });
    return new Response(html, {
      headers: {
        "content-type": "application/msword; charset=utf-8",
        "content-disposition": `attachment; filename="${base}.doc"`,
        "cache-control": "private, no-store",
      },
    });
  }

  const bytes = await buildAdmissionPdf({ school: data.school, application: data.application });
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${base}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
