import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DataCard } from "@/components/ui/DataCard";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { staffAttendanceDashboard } from "@/lib/staff-attendance-service";
import "../../module-workspace.css";

export default async function StaffAttendancePage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; staffId?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const start = /^\d{4}-\d{2}-\d{2}$/.test(params.start ?? "") ? params.start! : today;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(params.end ?? "") ? params.end! : start;

  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "attendance:review", session.schoolId);
    return staffAttendanceDashboard(tx, {
      actorId: session.userId,
      startDate: new Date(`${start}T00:00:00.000Z`),
      endDate: new Date(`${end}T00:00:00.000Z`),
      staffId: params.staffId || undefined
    });
  });

  return <AppShell universe="school" title="Staff Attendance" subtitle="Review staff presence, punctuality and attendance trends without mixing them into student class registers." active="Staff Attendance" userName={session.name} schoolName="School Workspace" schoolCode="">
    <div className="module-workspace">
      <section className="module-card">
        <form style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}><span>From</span><input type="date" name="start" defaultValue={start} /></label>
          <label style={{ display: "grid", gap: 6 }}><span>To</span><input type="date" name="end" defaultValue={end} /></label>
          <label style={{ display: "grid", gap: 6 }}><span>Staff member</span><select name="staffId" defaultValue={params.staffId ?? ""}><option value="">All active staff</option>{data.staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <button className="module-hero-button" type="submit" style={{ alignSelf: "end" }}>Apply filters →</button>
        </form>
      </section>

      <section className="module-metrics">
        <DataCard label="Present" value={data.totals.present} meta="Recorded IN events" tone="success" />
        <DataCard label="Late" value={data.totals.late} meta="IN events marked late" tone={data.totals.late ? "warning" : "success"} />
        <DataCard label="Absent" value={data.totals.absent} meta="Expected staff without IN" tone={data.totals.absent ? "warning" : "success"} />
        <DataCard label="Staff in scope" value={data.staff.length} meta="Active eligible staff" />
      </section>

      <section className="module-card">
        <div className="module-section-title"><div><span>{start} → {end}</span><h3>Daily staff coverage</h3><p>Use the trend to identify punctuality gaps and follow up on unexplained absences.</p></div><Link className="button secondary" href="/school/attendance">Student attendance</Link></div>
        <div className="module-table-wrap"><table><thead><tr><th>Date</th><th>Present</th><th>Late</th><th>Absent</th><th>Coverage</th></tr></thead><tbody>{data.trends.map(row => { const expected = row.present + row.absent; const coverage = expected ? Math.round((row.present / expected) * 100) : 100; return <tr key={row.date}><td>{row.date}</td><td>{row.present}</td><td>{row.late}</td><td>{row.absent}</td><td>{coverage}%</td></tr>; })}{!data.trends.length ? <tr><td colSpan={5}>No staff attendance records for this range.</td></tr> : null}</tbody></table></div>
      </section>
    </div>
  </AppShell>;
}
