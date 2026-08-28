import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import Link from "next/link";

async function createGuardian(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const relationship = String(formData.get("relationship") ?? "Parent").trim() || "Parent";
  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);
  if (!name || !phone) throw new Error("Guardian name and phone are required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    const existing = await tx.guardian.findUnique({ where: { schoolId_phone: { schoolId: session.schoolId, phone } }, select: { id: true, userId: true } });
    if (existing?.userId) throw new Error("A guardian portal account already exists for this phone number.");
    const passwordHash = await hash("12345", 12);
    const user = await tx.user.upsert({ where: { schoolId_phone: { schoolId: session.schoolId, phone } }, update: { name, email, passwordHash, status: "active" }, create: { schoolId: session.schoolId, name, phone, email, passwordHash, status: "active" } });
    const guardian = existing ?? await tx.guardian.create({ data: { schoolId: session.schoolId, userId: user.id, name, phone } });
    if (existing && !existing.userId) await tx.guardian.update({ where: { id: existing.id }, data: { userId: user.id, name } });
    for (const studentId of studentIds) {
      await tx.studentGuardian.upsert({ where: { studentId_guardianId: { studentId, guardianId: guardian.id } }, update: { relationship, isPrimary: true }, create: { schoolId: session.schoolId, studentId, guardianId: guardian.id, relationship, isPrimary: true } });
    }
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: existing ? "guardian.portal_provisioned" : "guardian.created", entityType: "Guardian", entityId: guardian.id, after: { name, phone, email, studentIds, temporaryPassword: true } } });
  });
  redirect("/school/guardians");
}

export default async function GuardiansPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, guardians, students] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.guardian.findMany({ orderBy: { name: "asc" }, include: { user: { select: { email: true, status: true } }, students: { include: { student: { select: { id: true, name: true, admissionNo: true, class: { select: { name: true, level: true } } } } } } } }),
      tx.student.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, admissionNo: true, class: { select: { name: true, level: true } } } })
    ]);
    return { school, guardians, students };
  });
  return <AppShell universe="school" title="Guardians" subtitle="Family accounts, child relationships and secure portal access." active="Parents & Guardians" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="module-workspace">
      <section className="module-setup-card module-card"><div><span className="module-overline">Family access</span><h3>One guardian account. Every connected child.</h3><p>Create a guardian profile, connect the children they are responsible for, and provision portal access. The guardian only sees those linked learners.</p><Link className="module-hero-button" href="#create">+ Create guardian account</Link></div><div className="module-setup-list"><a href="#create"><span>1</span>Capture guardian identity <b>Required</b></a><a href="#create"><span>2</span>Connect children <b>Choose learners</b></a><a href="#create"><span>3</span>Provision portal access <b>Phone/email + temporary password</b></a><a href="/school/communications/messages"><span>4</span>Communicate with families <b>Messages & alerts</b></a></div></section>
      <div className="module-metrics"><article><span>Guardians</span><strong>{data.guardians.length}</strong><small>Real family records</small></article><article><span>Portal enabled</span><strong>{data.guardians.filter((g) => Boolean(g.userId)).length}</strong><small>Accounts linked to guardians</small></article><article><span>Children linked</span><strong>{data.guardians.reduce((n, g) => n + g.students.length, 0)}</strong><small>Visible only through relationships</small></article></div>
      <div className="module-split"><section className="module-card"><div className="module-section-title"><div><span>Directory</span><h3>Guardian register</h3><p>Manage family identities and see their connected children.</p></div></div><div className="module-filter-row"><input placeholder="Search guardian, phone, email..."/><button type="button">Portal status</button><button type="button">Needs children</button></div><div className="module-table-wrap"><table><thead><tr><th>Guardian</th><th>Phone</th><th>Children</th><th>Portal</th><th>Status</th></tr></thead><tbody>{data.guardians.length ? data.guardians.map((g) => <tr key={g.id}><td style={{ padding: 12 }}><strong>{g.name}</strong><div style={{ color: "#60787d", fontSize: 8 }}>{g.user?.email ?? "No email"}</div></td><td style={{ padding: 12 }}>{g.phone}</td><td style={{ padding: 12 }}>{g.students.map((s) => s.student.name).join(", ") || "No children linked"}</td><td style={{ padding: 12 }}>{g.userId ? "Enabled" : "Not provisioned"}</td><td style={{ padding: 12 }}>{g.user?.status === "active" ? "Active" : "Review"}</td></tr>) : <tr><td colSpan={5}><div className="module-empty"><div className="module-empty-mark">◎</div><strong>No guardian records yet</strong><p>Create a guardian account below. No fabricated family records are shown.</p></div></td></tr>}</tbody></table></div></section><section className="module-card" id="create"><div className="module-section-title"><div><span>Provision access</span><h3>Create guardian account</h3><p>The temporary password is <strong>12345</strong>. Guardian must change it after first login.</p></div></div><form action={createGuardian} style={{ display: "grid", gap: 10, marginTop: 15 }}><input name="name" required placeholder="Full name" style={{ padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)", color: "#e5f3ef" }} /><input name="phone" required inputMode="tel" placeholder="Phone / WhatsApp" style={{ padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)", color: "#e5f3ef" }} /><input name="email" type="email" placeholder="Email (optional)" style={{ padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)", color: "#e5f3ef" }} /><select name="relationship" defaultValue="Parent" style={{ padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "#0d1d28", color: "#e5f3ef" }}><option>Parent</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Other</option></select><div style={{ display: "grid", gap: 6, maxHeight: 240, overflow: "auto", padding: 6, border: "1px solid rgba(255,255,255,.05)", borderRadius: 12 }}>{data.students.map((student) => <label key={student.id} style={{ display: "flex", gap: 9, alignItems: "center", padding: 8, borderRadius: 9, background: "rgba(255,255,255,.025)", color: "#a4b9ba", fontSize: 9 }}><input type="checkbox" name="studentIds" value={student.id} />{student.name}<span style={{ marginLeft: "auto", color: "#5f777d" }}>{student.admissionNo} · {student.class?.name ?? "Unassigned"}</span></label>)}</div><button className="module-hero-button" type="submit">Create guardian & provision portal →</button></form></section></div>
      <section className="module-card"><div className="module-section-title"><div><span>Guardian workflow</span><h3>How access works</h3><p>Designed around the school-to-family relationship.</p></div></div><div className="module-workflow">{["School creates the guardian profile and links children","SukuuNova provisions a portal account using the guardian phone and optional email","Guardian signs in at the Guardian Portal with the temporary password 12345","First login requires a password change before family data is accessible","Guardian sees only the children explicitly linked to their profile","School updates relationships when custody, enrolment or family details change"].map((step, i) => <div className="module-workflow-step" key={step}><span>{i + 1}</span><div><strong>{step}</strong><small>Role- and relationship-scoped</small></div></div>)}</div></section>
    </div>
  </AppShell>;
}
