import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import Link from "next/link";
import "./guardians.css";

async function createGuardian(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const relationship = String(formData.get("relationship") ?? "Parent").trim() || "Parent";
  const studentIds = [...new Set(formData.getAll("studentIds").map(String).filter(Boolean))];
  if (!name || !phone) throw new Error("Guardian name and phone are required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    const existingGuardian = await tx.guardian.findUnique({ where: { schoolId_phone: { schoolId: session.schoolId, phone } }, select: { id: true, userId: true } });
    if (existingGuardian?.userId) throw new Error("A guardian portal account already exists for this phone number.");
    const existingUser = await tx.user.findUnique({ where: { schoolId_phone: { schoolId: session.schoolId, phone } }, select: { id: true, name: true, email: true } });
    if (existingUser && !existingGuardian) throw new Error("This phone number already belongs to another school account. Use a different number or open that account instead.");
    if (existingUser && existingGuardian && existingGuardian.userId === null) throw new Error("This guardian has a pending profile but no login identity. Open the guardian record to finish access setup instead of creating another account.");
    const guardian = existingGuardian ?? await tx.guardian.create({ data: { schoolId: session.schoolId, name, phone } });
    if (email) {
      const emailOwner = await tx.user.findFirst({ where: { schoolId: session.schoolId, email }, select: { id: true } });
      if (emailOwner && emailOwner.id !== guardian.userId) throw new Error("That email address is already used by another school account.");
    }
    if (!guardian.userId) {
      const opaqueInitialSecret = randomBytes(24).toString("base64url");
      const user = await tx.user.create({ data: { schoolId: session.schoolId, name, phone, email, passwordHash: await hash(opaqueInitialSecret, 12), status: "pending", needsPasswordChange: true }, select: { id: true } });
      await tx.guardian.update({ where: { id: guardian.id }, data: { userId: user.id, name, phone } });
    } else {
      await tx.guardian.update({ where: { id: guardian.id }, data: { name, phone } });
    }
    for (const studentId of studentIds) {
      const student = await tx.student.findFirst({ where: { id: studentId }, select: { id: true } });
      if (!student) continue;
      const existingPrimary = await tx.studentGuardian.findFirst({ where: { studentId, isPrimary: true }, select: { guardianId: true } });
      await tx.studentGuardian.upsert({ where: { studentId_guardianId: { studentId, guardianId: guardian.id } }, update: { relationship, isPrimary: existingPrimary?.guardianId === guardian.id }, create: { schoolId: session.schoolId, studentId, guardianId: guardian.id, relationship, isPrimary: !existingPrimary } });
    }
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: existingGuardian ? "guardian.updated" : "guardian.created", entityType: "Guardian", entityId: guardian.id, after: { name, phone, email, linkedChildren: studentIds.length, loginAccess: "pending" } } });
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
  const portalEnabled = data.guardians.filter((guardian) => guardian.user?.status === "active").length;
  const linkedChildren = data.guardians.reduce((total, guardian) => total + guardian.students.length, 0);
  const familiesNeedingChildren = data.guardians.filter((guardian) => guardian.students.length === 0).length;
  const pendingAccess = data.guardians.filter((guardian) => guardian.userId && guardian.user?.status !== "active").length;
  return <AppShell universe="school" title="Guardians" subtitle="Manage family contacts, children and secure guardian access." active="Guardians" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="guardians-page"><section className="guardians-hero"><div><span className="eyebrow">People · Family directory</span><h2>Keep every family relationship clear.</h2><p>Find a guardian, see the children they are connected to, and manage portal access without mixing family records with login administration.</p></div><div className="guardians-hero-actions"><Link href="/school/communications/messages" className="button secondary">Message families</Link><a href="#create-guardian" className="button primary">+ Add guardian</a></div></section><section className="guardian-metrics" aria-label="Guardian overview"><article><span>Total guardians</span><strong>{data.guardians.length}</strong><small>Family contacts on record</small></article><article><span>Portal active</span><strong>{portalEnabled}</strong><small>{data.guardians.length ? `${Math.round((portalEnabled / data.guardians.length) * 100)}% active` : "No accounts yet"}</small></article><article><span>Children linked</span><strong>{linkedChildren}</strong><small>Connected learner relationships</small></article><article className={familiesNeedingChildren || pendingAccess ? "attention" : "ok"}><span>Needs attention</span><strong>{familiesNeedingChildren + pendingAccess}</strong><small>{pendingAccess ? `${pendingAccess} awaiting access activation` : familiesNeedingChildren ? "Family records need a child link" : "All family records are connected"}</small></article></section><section className="guardian-workspace"><div className="guardian-directory-panel"><div className="section-heading"><div><span className="eyebrow">Family register</span><h3>Guardians & linked children</h3><p>Open a family row to work with the relationship and portal access.</p></div></div><div className="guardian-toolbar"><input aria-label="Search guardians" placeholder="Search name, phone or email" /><select aria-label="Portal access filter" defaultValue="all"><option value="all">All portal states</option><option value="enabled">Portal active</option><option value="pending">Access pending</option></select><select aria-label="Family links filter" defaultValue="all"><option value="all">All family links</option><option value="linked">Has children</option><option value="missing">Needs child link</option></select><button type="button" className="button secondary">Filter</button></div>{data.guardians.length ? <div className="guardian-table-wrap"><table className="guardian-table"><thead><tr><th>Guardian</th><th>Children</th><th>Portal</th><th>Status</th><th /></tr></thead><tbody>{data.guardians.map((guardian) => <tr key={guardian.id}><td><div className="guardian-name-cell"><span className="guardian-avatar">{guardian.name.slice(0, 2).toUpperCase()}</span><div><strong>{guardian.name}</strong><span>{guardian.phone}{guardian.user?.email ? ` · ${guardian.user.email}` : ""}</span></div></div></td><td><div className="children-cell">{guardian.students.length ? guardian.students.map((link) => <span key={link.student.id}>{link.student.name}<small>{link.student.class?.name ?? "Needs placement"}</small></span>) : <em>No children linked</em>}</div></td><td><span className={`status-chip ${guardian.user?.status === "active" ? "good" : "neutral"}`}>{guardian.user?.status === "active" ? "Active" : "Pending"}</span></td><td><span className={`status-chip ${guardian.user?.status === "active" ? "good" : "neutral"}`}>{guardian.user?.status === "active" ? "Ready" : "Access setup"}</span></td><td><Link className="row-action" href={`/school/guardians/${guardian.id}`}>Open →</Link></td></tr>)}</tbody></table></div> : <div className="guardian-empty"><div className="empty-mark">♧</div><strong>No guardians yet</strong><p>Create the first family record and connect their child in the same workflow.</p><a href="#create-guardian" className="button primary">Add first guardian</a></div>}</div><aside className="guardian-create-panel" id="create-guardian"><div className="section-heading"><div><span className="eyebrow">New family</span><h3>Add guardian</h3><p>Create the family record and connect one or more learners. Login activation is handled separately.</p></div></div><form action={createGuardian} className="guardian-form"><label>Full name<input name="name" required placeholder="e.g. Ama Mensah" /></label><label>Phone / WhatsApp<input name="phone" required inputMode="tel" placeholder="024 000 0000" /></label><label>Email <span className="optional">Optional</span><input name="email" type="email" placeholder="guardian@example.com" /></label><label>Relationship<select name="relationship" defaultValue="Parent"><option>Parent</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Other</option></select></label><div className="child-picker"><div className="child-picker-head"><strong>Connect children</strong><span>{data.students.length} active learners</span></div><div className="child-list">{data.students.map((student) => <label key={student.id}><input type="checkbox" name="studentIds" value={student.id} /><span><b>{student.name}</b><small>{student.admissionNo} · {student.class?.name ?? "Unassigned"}</small></span></label>)}</div></div><div className="portal-note"><strong>Portal access is separate</strong><span>The guardian profile is created first. An authorised administrator activates a login from Sub-accounts & Access and sets the initial password there.</span></div><button className="button primary" type="submit">Create guardian & connect →</button></form></aside></section></div>
  </AppShell>;
}
