import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import AttendanceDisplay from "./AttendanceDisplay";
import "./attendance-display.css";

export default async function AttendanceDisplayPage() {
  const session = await requireSchoolSession();
  const result = await withTenant(session.schoolId, async (tx) => {
    const [school, canDisplay] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true } }),
      hasPermission(tx, session.userId, "attendance:display"),
    ]);
    return { school, canDisplay };
  });

  if (!result.school) redirect("/dashboard");
  if (!result.canDisplay) {
    return (
      <main className="attendance-live-display">
        <div className="attendance-live-frame">
          <header className="attendance-live-header">
            <div>
              <span>SukuuNova Attendance</span>
              <h1>QR station access is not enabled for this account</h1>
              <p>The school owner or an authorised administrator can grant the “Open attendance display” permission in People &amp; Access.</p>
            </div>
          </header>
          <section className="attendance-live-stage">
            <aside className="attendance-live-guide">
              <span className="attendance-live-kicker">What to do</span>
              <ol>
                <li><b>1</b><div><strong>Return to Attendance Control</strong><small>No attendance data was changed.</small></div></li>
                <li><b>2</b><div><strong>Review People &amp; Access</strong><small>Give this display account only the attendance-display right it needs.</small></div></li>
                <li><b>3</b><div><strong>Launch the station again</strong><small>The rotating code will start immediately once access is valid.</small></div></li>
              </ol>
              <div className="staff-checkin-actions">
                <Link href="/school/devices">Attendance Control</Link>
                <Link href="/school/settings/access">People &amp; Access</Link>
              </div>
            </aside>
          </section>
        </div>
      </main>
    );
  }

  return <AttendanceDisplay schoolName={result.school.name} />;
}
