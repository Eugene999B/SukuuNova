import Link from "next/link";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { HeartHandshake } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { linkGuardianToStudent } from "@/lib/guardian-service";
import { DetailGrid, ProductEmpty, ProductPageHeader, ProductSection } from "@/components/product/ProductWorkspace";
import { AddGuardianDialog } from "@/components/product/AddGuardianDialog";
import { GuardianDirectory } from "@/components/product/GuardianDirectory";
import "@/components/product/product-workspace.css";

async function createGuardian(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const relationship = String(formData.get("relationship") ?? "Parent").trim() || "Parent";
  const studentIds = [...new Set(formData.getAll("studentIds").map(String).filter(Boolean))];
  if (!name || !phone) throw new Error("Guardian name and phone are required.");
  if (studentIds.length === 0) throw new Error("Choose at least one learner to link.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guardian-create:${session.schoolId}:${phone}`}))`;
    const existingGuardian = await tx.guardian.findUnique({ where: { schoolId_phone: { schoolId: session.schoolId, phone } }, select: { id: true, userId: true } });
    if (existingGuardian?.userId) throw new Error("A guardian portal account already exists for this phone number.");
    const existingUser = await tx.user.findUnique({ where: { schoolId_phone: { schoolId: session.schoolId, phone } }, select: { id: true, name: true, email: true } });
    if (existingUser && !existingGuardian) throw new Error("This phone number already belongs to another school account. Use a different number or open that account instead.");
    if (existingUser && existingGuardian && existingGuardian.userId === null) throw new Error("This guardian has a pending profile but no login identity. Open the guardian record to finish access setup instead of creating another account.");
    let guardian;
    try {
      guardian = existingGuardian ?? await tx.guardian.create({ data: { schoolId: session.schoolId, name, phone } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new Error("A guardian with this phone number was just created. Refresh and try again.");
      throw error;
    }
    if (email) {
      const emailOwner = await tx.user.findFirst({ where: { schoolId: session.schoolId, email }, select: { id: true } });
      if (emailOwner && emailOwner.id !== guardian.userId) throw new Error("That email address is already used by another school account.");
    }
    if (!guardian.userId) {
      const opaqueInitialSecret = randomBytes(24).toString("base64url");
      try {
        const user = await tx.user.create({ data: { schoolId: session.schoolId, name, phone, email, passwordHash: await hash(opaqueInitialSecret, 12), status: "pending", needsPasswordChange: true }, select: { id: true } });
        await tx.guardian.update({ where: { id: guardian.id }, data: { userId: user.id, name, phone } });
        guardian = { ...guardian, userId: user.id };
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") throw new Error("A school account with this phone or email was just created. Refresh and try again.");
        throw error;
      }
    } else {
      await tx.guardian.update({ where: { id: guardian.id }, data: { name, phone } });
    }
    for (const studentId of studentIds) {
      const student = await tx.student.findFirst({ where: { id: studentId, schoolId: session.schoolId }, select: { id: true } });
      if (!student) continue;
      await linkGuardianToStudent(tx, { schoolId: session.schoolId, studentId, guardianId: guardian.id, relationship });
    }
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: existingGuardian ? "guardian.updated" : "guardian.created", entityType: "Guardian", entityId: guardian.id, after: { name, phone, email, linkedChildren: studentIds.length, loginAccess: "pending" } } });
  });
  redirect("/school/guardians");
}

export default async function GuardiansPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, guardians, students, links] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.guardian.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, email: true, userId: true, user: { select: { status: true } } } }),
      tx.student.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, admissionNo: true, class: { select: { name: true, level: true } } } }),
      tx.studentGuardian.findMany({ select: { guardianId: true, studentId: true } }),
    ]);
    const guardianCounts = new Map<string, number>();
    for (const l of links) guardianCounts.set(l.studentId, (guardianCounts.get(l.studentId) ?? 0) + 1);
    const linksByGuardian = new Map<string, Array<{ id: string; name: string; className: string | null }>>();
    const byStudent = new Map(students.map((s) => [s.id, s]));
    for (const l of links) {
      const s = byStudent.get(l.studentId);
      if (!s) continue;
      const arr = linksByGuardian.get(l.guardianId) ?? [];
      arr.push({ id: s.id, name: s.name, className: s.class?.name ?? null });
      linksByGuardian.set(l.guardianId, arr);
    }
    return { school, guardians, students, guardianCounts, linksByGuardian };
  });

  const portalEnabled = data.guardians.filter((g) => g.user?.status === "active").length;
  const pendingAccess = data.guardians.filter((g) => g.userId && g.user?.status !== "active").length;

  return (
    <AppShell universe="school" title="Guardians" subtitle="Family directory — relationships, contact truth and portal access." active="Guardians" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="product-workspace">
        <ProductPageHeader
          eyebrow="People · Family directory"
          title="Every family relationship, clear"
          description="Find a guardian, see linked learners and portal state, then act. Backend enforces portal uniqueness; the dialog surfaces those errors plainly."
          stats={[
            { label: "Guardians", value: String(data.guardians.length) },
            { label: "Portal active", value: String(portalEnabled) },
            { label: "Pending activation", value: String(pendingAccess) },
          ]}
          actions={
            <>
              <Link className="button secondary" href="/school/communications/messages">
                Message families
              </Link>
              <AddGuardianDialog
                students={data.students.map((s) => ({
                  id: s.id,
                  name: s.name,
                  admissionNo: s.admissionNo,
                  className: s.class ? `${s.class.level ? `${s.class.level} · ` : ""}${s.class.name}` : null,
                  guardianCount: data.guardianCounts.get(s.id) ?? 0,
                }))}
                action={createGuardian}
              />
            </>
          }
        />
        <ProductSection eyebrow="Overview" title="Attention queue" description="What needs a family admin next?">
          <DetailGrid
            items={[
              { label: "Children linked", value: String([...data.linksByGuardian.values()].reduce((n, arr) => n + arr.length, 0)) },
              { label: "Pending portal", value: String(pendingAccess), hint: pendingAccess ? "Activate on first sign-in" : "All clear" },
              { label: "Active learners", value: String(data.students.length), hint: "Searchable in the dialog" },
            ]}
          />
        </ProductSection>
        <ProductSection eyebrow="Family register" title="Guardians & linked children" description="Fast search replaces scrolling hundreds of rows. Open any guardian for the full workspace.">
          <GuardianDirectory
            guardians={data.guardians.map((g) => ({
              id: g.id,
              name: g.name,
              phone: g.phone,
              email: g.email,
              portal: g.user?.status ?? null,
              students: data.linksByGuardian.get(g.id) ?? [],
            }))}
          />
        </ProductSection>
        {data.guardians.length === 0 ? (
          <ProductSection eyebrow="Empty" title="No family records" description="Create the first guardian to connect learners to families.">
            <ProductEmpty icon={HeartHandshake} title="Start the family directory" description="No invented records are shown. The dialog creates a real guardian, links a real learner, and provisions pending portal access." />
          </ProductSection>
        ) : null}
      </div>
    </AppShell>
  );
}
