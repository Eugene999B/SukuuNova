import Link from "next/link";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getSchoolAuthorization } from "@/lib/authorization";
import { AppShell } from "@/components/AppShell";
import { resolveStudentTermClass } from "@/lib/student-term-context";
import { selectAcademicTerm } from "@/lib/term-date";

export default async function ReportRemarksCentre({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "report_cards:view");
    const access = await getSchoolAuthorization(tx, session.userId);
    const [school, settings, classes, terms] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true } }),
      tx.class.findMany({
        where: access.isElevated ? { schoolId: session.schoolId } : { schoolId: session.schoolId, classTeacherId: session.userId },
        select: { id: true, name: true, level: true },
        orderBy: [{ level: "asc" }, { name: "asc" }],
      }),
      tx.term.findMany({
        where: { schoolId: session.schoolId },
        select: { id: true, name: true, startDate: true, endDate: true, isLocked: true },
        orderBy: { startDate: "desc" },
        take: 12,
      }),
    ]);

    const term = selectAcademicTerm(terms, params.term, new Date(), settings?.timezone ?? "Africa/Accra");
    if (!term || !classes.length) return { school, classes, terms, term, reports: [] as Array<{ id: string; status: string; remarks: string | null; termClassId: string; student: { id: string; name: string; admissionNo: string } }> };

    const classIds = new Set(classes.map((schoolClass) => schoolClass.id));
    const rawReports = await tx.reportCard.findMany({
      where: { schoolId: session.schoolId, termId: term.id },
      select: { id: true, status: true, remarks: true, student: { select: { id: true, name: true, admissionNo: true } } },
      orderBy: { student: { name: "asc" } },
    });
    const reports = [] as Array<{ id: string; status: string; remarks: string | null; termClassId: string; student: { id: string; name: string; admissionNo: string } }>;
    for (const report of rawReports) {
      const context = await resolveStudentTermClass(tx, { schoolId: session.schoolId, studentId: report.student.id, termId: term.id });
      if (classIds.has(context.classId)) reports.push({ ...report, termClassId: context.classId });
    }
    return { school, classes, terms, term, reports };
  });

  if (!data.school) return null;
  const byClass = new Map(data.classes.map((schoolClass) => [schoolClass.id, [] as typeof data.reports]));
  for (const report of data.reports) byClass.get(report.termClassId)?.push(report);

  return (
    <AppShell universe="school" title="Class Teacher Remarks" subtitle="Individual report-card remarks." active="Report Cards" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: 24, color: "var(--color-text-primary,var(--color-surface-raised))" }}>
        <header style={{ marginBottom: 18 }}>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".14em", color: "var(--color-text-muted,var(--color-text-muted))" }}>REPORT CARD WORKFLOW</span>
          <h1 style={{ margin: "7px 0", fontSize: 32, letterSpacing: "-.04em" }}>Write each learner&apos;s class-teacher remark.</h1>
          <p style={{ margin: 0, maxWidth: 780, color: "var(--color-text-secondary,var(--color-text-muted))", fontSize: 12, lineHeight: 1.7 }}>Choose the reporting term explicitly. Learners stay grouped by the class they belonged to in that term, even after promotion.</p>
        </header>

        <form method="get" style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", padding: 14, border: "1px solid var(--color-border,var(--color-border))", borderRadius: 16, background: "var(--color-surface,var(--color-surface))", marginBottom: 14 }}>
          <label style={{ display: "grid", gap: 6, minWidth: 240 }}>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-text-muted,var(--color-text-muted))" }}>Reporting term</span>
            <select name="term" defaultValue={data.term?.id ?? ""} style={{ height: 40, border: "1px solid var(--color-border,var(--color-border))", borderRadius: 10, padding: "0 10px", background: "var(--color-surface-2,var(--color-bg))" }}>
              <option value="">Choose a term</option>
              {data.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </label>
          <button type="submit" style={{ height: 40, border: 0, borderRadius: 10, padding: "0 14px", background: "var(--color-brand,var(--color-brand-hover))", color: "white", fontWeight: 900 }}>Open term</button>
        </form>

        {!data.term || !data.classes.length ? (
          <section style={{ padding: 30, border: "1px dashed var(--color-border,var(--color-border))", borderRadius: 16, textAlign: "center", background: "var(--color-surface,var(--color-surface))" }}>
            <strong>{!data.classes.length ? "No class-teacher classes are assigned to you." : "Choose a reporting term. SukuuNova will not guess across a gap or overlapping terms."}</strong>
          </section>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {data.classes.map((schoolClass) => {
              const reports = byClass.get(schoolClass.id) ?? [];
              return (
                <section key={schoolClass.id} style={{ border: "1px solid var(--color-border,var(--sn-line))", borderRadius: 18, background: "var(--color-surface,var(--sn-line))", overflow: "hidden", boxShadow: "0 12px 30px var(--sn-line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "15px 16px", borderBottom: "1px solid var(--color-border,var(--color-border))" }}>
                    <div><strong style={{ fontSize: 14 }}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</strong><small style={{ display: "block", marginTop: 4, color: "var(--color-text-muted,var(--color-text-muted))", fontSize: 9 }}>{reports.length} report{reports.length === 1 ? "" : "s"} for this term</small></div>
                    <Link href={`/school/report-cards?term=${encodeURIComponent(data.term.id)}&classId=${encodeURIComponent(schoolClass.id)}`} style={{ fontSize: 9, fontWeight: 900, textDecoration: "none" }}>Open reports →</Link>
                  </div>
                  {reports.length ? <div>{reports.map((report) => <div key={report.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--color-bg-subtle)" }}><div><strong style={{ display: "block", fontSize: 11 }}>{report.student.name}</strong><small style={{ display: "block", marginTop: 3, color: "var(--color-text-muted,var(--color-text-muted))", fontSize: 8 }}>{report.student.admissionNo}</small></div><span style={{ fontSize: 8, fontWeight: 900, color: report.status === "draft" ? "var(--color-warning)" : "var(--color-text-muted)" }}>{report.status === "draft" ? "EDITABLE" : "LOCKED"}</span><Link href={`/school/report-cards/${report.id}/remarks`} style={{ border: "1px solid var(--color-border,var(--sn-line))", borderRadius: 10, padding: "8px 10px", fontSize: 8, fontWeight: 900, textDecoration: "none", color: "var(--color-text-primary,var(--sn-line))" }}>{report.status === "draft" ? "Write remark" : "View report"}</Link></div>)}</div> : <div style={{ padding: 18, color: "var(--color-text-muted,var(--color-text-muted))", fontSize: 10 }}>No report card has been generated for this class and term yet.</div>}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </AppShell>
  );
}
