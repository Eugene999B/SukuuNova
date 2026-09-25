import Link from "next/link";
import OfficialReportCard from "@/components/OfficialReportCard";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { requireReportAccess } from "@/lib/report-card-access";
import { getReportCardPrintData } from "@/lib/report-card-print-data";
import { signaturesForReport } from "@/lib/report-card-signatures";

function AccessMessage({ body }: { body: string }) {
  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: 24, fontFamily: "var(--sn-font-family)" }}>
      <h1>Report card unavailable</h1>
      <p>{body}</p>
      <Link href="/school/report-cards">Back to Report Cards</Link>
    </main>
  );
}

export default async function ReportCardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    if (!(await hasPermission(tx, session.userId, "report_cards:view"))) {
      return { kind: "denied" as const, message: "Your account does not have permission to view report cards." };
    }

    await requireReportAccess(tx, session.userId, id);

    const [report, signatures] = await Promise.all([
      getReportCardPrintData(tx, { schoolId: session.schoolId, reportId: id }),
      signaturesForReport(tx, { schoolId: session.schoolId, reportId: id }),
    ]);
    return { kind: "ready" as const, report, signatures };
  });

  if (data.kind === "denied") return <AccessMessage body={data.message} />;
  return <OfficialReportCard data={data.report} signatures={data.signatures} />;
}
