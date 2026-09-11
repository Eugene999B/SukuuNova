import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock3, ShieldCheck, UserCheck, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { addApprovedPickup, attemptPickup, reviewPickupRequest } from "@/lib/pickup-service";
import "./pickup-workspace.css";

async function approveGuardian(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const studentId = String(formData.get("studentId") ?? "");
  const guardianId = String(formData.get("guardianId") ?? "");
  await withTenant(session.schoolId, (tx) => addApprovedPickup(tx, { schoolId: session.schoolId, actorId: session.userId, studentId, guardianId }));
  redirect("/school/pickup");
}

async function requestPickup(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const studentId = String(formData.get("studentId") ?? "");
  const guardianId = String(formData.get("guardianId") ?? "");
  await withTenant(session.schoolId, (tx) => attemptPickup(tx, { schoolId: session.schoolId, actorId: session.userId, studentId, guardianId }));
  redirect("/school/pickup");
}

async function review(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "") as "approved" | "rejected";
  await withTenant(session.schoolId, (tx) => reviewPickupRequest(tx, { schoolId: session.schoolId, actorId: session.userId, requestId, decision }));
  redirect("/school/pickup");
}

function timeLabel(value: Date) {
  return new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

export default async function PickupPage() {
  const session = await requireSchoolSession();
  const todayStart = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const data = await withTenant(session.schoolId, async (tx) => {
    const [school, students, guardians, approved, requests, events, activeLearnerCount, approvedCount, pendingCount, pickupsTodayCount, canApprove, canRecord] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.student.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, admissionNo: true, class: { select: { name: true, level: true } } } }),
      tx.guardian.findMany({ where: { schoolId: session.schoolId }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, phone: true } }),
      tx.approvedPickup.findMany({ where: { schoolId: session.schoolId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, studentId: true, guardianId: true, student: { select: { name: true, admissionNo: true } }, guardian: { select: { name: true, phone: true } } } }),
      tx.pickupApprovalRequest.findMany({ where: { schoolId: session.schoolId, status: "pending" }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, studentId: true, collectedByGuardianId: true, requestedByUserId: true, createdAt: true, student: { select: { name: true, admissionNo: true, class: { select: { name: true } } } }, collectingGuardian: { select: { name: true, phone: true } }, requester: { select: { name: true } } } }),
      tx.pickupEvent.findMany({ where: { schoolId: session.schoolId }, orderBy: { timestamp: "desc" }, take: 80, select: { id: true, timestamp: true, wasPreApproved: true, student: { select: { name: true, admissionNo: true, class: { select: { name: true } } } }, collectingGuardian: { select: { name: true } } } }),
      tx.student.count({ where: { schoolId: session.schoolId, status: "active" } }),
      tx.approvedPickup.count({ where: { schoolId: session.schoolId } }),
      tx.pickupApprovalRequest.count({ where: { schoolId: session.schoolId, status: "pending" } }),
      tx.pickupEvent.count({ where: { schoolId: session.schoolId, timestamp: { gte: todayStart, lt: tomorrowStart } } }),
      hasPermission(tx, session.userId, "attendance:pickup_approve"),
      hasPermission(tx, session.userId, "attendance:record"),
    ]);
    return { school, students, guardians, approved, requests, events, activeLearnerCount, approvedCount, pendingCount, pickupsTodayCount, canApprove, canRecord };
  });

  return <AppShell universe="school" title="Pickup & Gate" subtitle="Verify every learner collection against the same school record." active="Pickup" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <main className="pickup-shell">
      <section className="pickup-hero">
        <div>
          <span className="pickup-kicker">SAFE COLLECTION CONTROL</span>
          <h1>Know who is taking each learner home.</h1>
          <p>Gate staff records the learner and collector once. Pre-approved collectors pass immediately; an unexpected collector waits for a second authorised staff member to approve or reject the request.</p>
        </div>
        <div className="pickup-hero-status"><ShieldCheck size={20} /><span><strong>Two-person control</strong><small>Unscheduled pickup approval cannot be completed by the staff member who requested it.</small></span></div>
      </section>

      <section className="pickup-metrics" aria-label="Pickup summary">
        <article><Clock3 size={18} /><span><small>Waiting now</small><strong>{data.pendingCount}</strong><p>Unscheduled collections</p></span></article>
        <article><UserCheck size={18} /><span><small>Picked up today</small><strong>{data.pickupsTodayCount}</strong><p>Recorded collections</p></span></article>
        <article><CheckCircle2 size={18} /><span><small>Recurring approvals</small><strong>{data.approvedCount}</strong><p>Trusted learner–collector links</p></span></article>
        <article><UsersRound size={18} /><span><small>Active learners</small><strong>{data.activeLearnerCount}</strong><p>Available at the gate</p></span></article>
      </section>

      <section className="pickup-primary-grid">
        <article className="pickup-card pickup-record-card">
          <header><span>GATE ACTION</span><h2>Record a learner collection</h2><p>Select the learner and the person collecting them. SukuuNova checks the approval record before completing the pickup.</p></header>
          {data.canRecord ? <form action={requestPickup} className="pickup-form">
            <label><span>Learner</span><select name="studentId" required defaultValue=""><option value="">Choose learner</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.admissionNo}{student.class ? ` · ${student.class.name}` : ""}</option>)}</select></label>
            <label><span>Collector</span><select name="guardianId" required defaultValue=""><option value="">Choose collecting guardian</option>{data.guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name}{guardian.phone ? ` · ${guardian.phone}` : ""}</option>)}</select></label>
            <button type="submit">Check approval & record pickup</button>
          </form> : <div className="pickup-access-note"><ShieldCheck size={18} /><div><strong>Gate recording is read-only for this account.</strong><p>An account with student-attendance recording permission can initiate a pickup.</p></div></div>}
          <div className="pickup-flow"><span><b>1</b> Select learner</span><span><b>2</b> Select collector</span><span><b>3</b> Verify approval</span><span><b>4</b> Record release</span></div>
        </article>

        <aside className="pickup-card pickup-approval-card">
          <header><span>REQUIRES A SECOND CHECK</span><h2>Pending approvals</h2><p>{data.pendingCount ? `${data.pendingCount} collection${data.pendingCount === 1 ? " is" : "s are"} waiting for a decision.` : "No unexpected collection is waiting."}</p></header>
          {data.requests.length ? <div className="pickup-request-list">{data.requests.map((request) => {
            const ownRequest = request.requestedByUserId === session.userId;
            return <article className="pickup-request" key={request.id}>
              <div className="pickup-request-person"><strong>{request.student.name}</strong><span>{request.student.admissionNo}{request.student.class?.name ? ` · ${request.student.class.name}` : ""}</span></div>
              <div className="pickup-request-collector"><small>Collector</small><strong>{request.collectingGuardian.name}</strong><span>{request.collectingGuardian.phone ?? "No phone recorded"}</span></div>
              <div className="pickup-request-meta"><span>{timeLabel(request.createdAt)}</span><span>Requested by {request.requester?.name ?? "gate staff"}</span></div>
              {data.canApprove && !ownRequest ? <form action={review} className="pickup-review-actions">
                <input type="hidden" name="requestId" value={request.id} />
                <button type="submit" name="decision" value="rejected" className="reject">Reject</button>
                <button type="submit" name="decision" value="approved" className="approve">Approve & release</button>
              </form> : <div className="pickup-awaiting"><ShieldCheck size={15} /><span>{ownRequest ? "A different authorised staff member must review this request." : "Waiting for an authorised approver."}</span></div>}
            </article>;
          })}</div> : <div className="pickup-empty"><CheckCircle2 size={24} /><strong>Gate queue is clear</strong><span>Unexpected collectors will appear here before any learner is released.</span></div>}
        </aside>
      </section>

      {data.canApprove ? <details className="pickup-details">
        <summary><span><strong>Recurring approved collectors</strong><small>{data.approvedCount} learner–guardian approvals</small></span><b>Manage</b></summary>
        <div className="pickup-details-body">
          <p>Add a recurring approval only when the school has verified that this guardian may collect the learner without a new approval each time.</p>
          <form action={approveGuardian} className="pickup-form compact">
            <label><span>Learner</span><select name="studentId" required defaultValue=""><option value="">Choose learner</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.admissionNo}</option>)}</select></label>
            <label><span>Guardian</span><select name="guardianId" required defaultValue=""><option value="">Choose guardian</option>{data.guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name} · {guardian.phone ?? "No phone"}</option>)}</select></label>
            <button type="submit">Approve recurring collector</button>
          </form>
          {data.approved.length ? <div className="pickup-approved-grid">{data.approved.slice(0, 12).map((approval) => <div key={approval.id}><strong>{approval.student.name}</strong><span>{approval.guardian.name}</span><small>{approval.guardian.phone ?? "No phone recorded"}</small></div>)}</div> : null}
        </div>
      </details> : null}

      <details className="pickup-details" open>
        <summary><span><strong>Recent pickup history</strong><small>{data.events.length} latest recorded events</small></span><b>Audit trail</b></summary>
        <div className="pickup-details-body">
          <div className="pickup-table-wrap"><table className="pickup-table"><thead><tr><th>Learner</th><th>Collected by</th><th>Time</th><th>Verification</th></tr></thead><tbody>{data.events.map((event) => <tr key={event.id}><td><strong>{event.student.name}</strong><small>{event.student.admissionNo}{event.student.class?.name ? ` · ${event.student.class.name}` : ""}</small></td><td>{event.collectingGuardian.name}</td><td>{new Date(event.timestamp).toLocaleString("en-GH")}</td><td><span className={`pickup-pill ${event.wasPreApproved ? "trusted" : "reviewed"}`}>{event.wasPreApproved ? "Pre-approved" : "Approved at gate"}</span></td></tr>)}{data.events.length === 0 ? <tr><td colSpan={4}><div className="pickup-empty"><strong>No pickup events yet</strong><span>Completed learner collections will appear here.</span></div></td></tr> : null}</tbody></table></div>
        </div>
      </details>

      <div className="pickup-footer-actions"><Link href="/school/students">Open student register</Link><Link href="/school/settings/access">Review gate permissions</Link></div>
    </main>
  </AppShell>;
}
