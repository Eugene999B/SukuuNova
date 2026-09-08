import { notFound } from "next/navigation";
import AutoPrint from "@/components/AutoPrint";
import OfficialReportCard from "@/components/OfficialReportCard";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getSchoolAuthorization } from "@/lib/authorization";
import { calculateIntelligentReportCard } from "@/lib/report-card-intelligence";

type Signature = { role: string; name: string; signatureDataUrl?: string };

export default async function ReportCardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const access = await getSchoolAuthorization(tx, session.userId);
    const gate = await tx.reportCard.findFirst({
      where: { id, schoolId: session.schoolId },
      select: { student: { select: { class: { select: { id: true, classTeacherId: true } } } } },
    });
    if (!gate || !gate.student.class) return null;
    if (!access.isElevated) {
      if (!access.isTeacher) throw new Error("Only the school academic team or assigned teachers can view report cards.");
      const assigned = gate.student.class.classTeacherId === session.userId || Boolean(
        await tx.classSubjectTeacher.findFirst({ where: { schoolId: session.schoolId, classId: gate.student.class.id, teacherId: session.userId } }),
      );
      if (!assigned) throw new Error("Teachers may only view report cards for their assigned classes.");
    }
    const report = await calculateIntelligentReportCard(tx, { schoolId: session.schoolId, reportId: id });
    const settings = await tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { reportCardConfig: true } });
    const raw = settings?.reportCardConfig && typeof settings.reportCardConfig === "object" && !Array.isArray(settings.reportCardConfig) ? settings.reportCardConfig as Record<string, unknown> : {};
    const signatures = Array.isArray(raw.signatureSlots)
      ? raw.signatureSlots.filter((s): s is Signature => Boolean(s) && typeof s === "object" && !Array.isArray(s)).map((s) => ({
          role: typeof s.role === "string" ? s.role : "School Official",
          name: typeof s.name === "string" ? s.name : "",
          signatureDataUrl: typeof s.signatureDataUrl === "string" ? s.signatureDataUrl : "",
        }))
      : [];
    return { report, signatures };
  });
  if (!data) notFound();
  return <AutoPrint><OfficialReportCard data={data.report} signatures={data.signatures} /></AutoPrint>;
}
