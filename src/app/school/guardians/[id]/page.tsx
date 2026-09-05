import Link from "next/link";
import { notFound } from "next/navigation";
import { HeartHandshake, Mail, Phone } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { DetailGrid, ProductPageHeader, ProductSection, StatusBadge } from "@/components/product/ProductWorkspace";
import "@/components/product/product-workspace.css";

export default async function GuardianDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, guardian] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.guardian.findFirst({
        where: { id, schoolId: session.schoolId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          userId: true,
          user: { select: { status: true, email: true, needsPasswordChange: true } },
          students: { select: { relationship: true, isPrimary: true, student: { select: { id: true, name: true, admissionNo: true, status: true, class: { select: { name: true, level: true } } } } } },
        },
      }),
    ]);
    return { school, guardian };
  });

  if (!data.school) notFound();
  if (!data.guardian) {
    return (
      <AppShell universe="school" title="Guardian not found" subtitle="Family directory." active="Guardians" schoolName="School Workspace" schoolCode="" userName={session.name}>
        <div className="product-workspace">
          <ProductPageHeader eyebrow="Family directory" title="Guardian not found" description="This family record does not exist in your school, was moved, or you followed a stale link." backHref="/school/guardians" backLabel="Guardians" />
          <ProductSection eyebrow="Recovery" title="What can you do next?" description="Search the directory or create the family record again. No data was deleted by opening this page.">
            <Link className="button primary" href="/school/guardians">
              Back to guardians
            </Link>
          </ProductSection>
        </div>
      </AppShell>
    );
  }

  const g = data.guardian;
  return (
    <AppShell universe="school" title={g.name} subtitle="Guardian workspace — identity, linked learners and portal access." active="Guardians" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <div className="product-workspace">
        <ProductPageHeader
          eyebrow="Family workspace"
          title={g.name}
          description={`${g.students.length} linked learner${g.students.length === 1 ? "" : "s"} · ${g.userId ? "Portal provisioned" : "No portal account yet"}`}
          backHref="/school/guardians"
          backLabel="Guardians"
          actions={
            <Link className="button secondary" href="/school/communications/messages">
              Message family
            </Link>
          }
        />
        <ProductSection eyebrow="Identity" title="Guardian identity" description="Contact truth for messages, report cards and pickup.">
          <DetailGrid
            items={[
              { label: "Name", value: g.name },
              { label: "Phone", value: g.phone ?? "—", hint: g.phone ? undefined : "Add a phone to enable SMS/WhatsApp" },
              { label: "Email", value: g.email ?? g.user?.email ?? "—" },
              { label: "Portal", value: g.userId ? (g.user?.status ?? "pending") : "Not provisioned", hint: g.user?.needsPasswordChange ? "Must change password on first sign-in" : undefined },
            ]}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", fontSize: 13, color: "var(--color-text-secondary)" }}>
            {g.phone ? (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <Phone size={14} aria-hidden="true" /> {g.phone}
              </span>
            ) : null}
            {g.email || g.user?.email ? (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <Mail size={14} aria-hidden="true" /> {g.email ?? g.user?.email}
              </span>
            ) : null}
          </div>
        </ProductSection>
        <ProductSection eyebrow="Relationships" title={`Linked learners (${g.students.length})`} description="Each row is one explicit school relationship. Primary marks the first contact for fees and emergencies.">
          {g.students.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No children linked yet. Link from the guardian directory.</p>
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Class</th>
                    <th scope="col">Relationship</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {g.students.map((link) => (
                    <tr key={link.student.id}>
                      <td>
                        <Link href={`/school/students/${link.student.id}`}>
                          {link.student.name}
                        </Link>
                        <small style={{ display: "block", color: "var(--color-text-muted)" }}>
                          {link.student.admissionNo}
                          {link.isPrimary ? " · Primary" : ""}
                        </small>
                      </td>
                      <td>{link.student.class ? `${link.student.class.level ? `${link.student.class.level} · ` : ""}${link.student.class.name}` : "Unassigned"}</td>
                      <td>{link.relationship}</td>
                      <td>
                        <StatusBadge tone={link.student.status === "active" ? "success" : "neutral"}>{link.student.status}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ProductSection>
        <ProductSection eyebrow="Account" title="Portal & actions" description="Portal state is enforced by the backend; the UI only reflects it.">
          <DetailGrid
            items={[
              { label: "Account status", value: g.user?.status ?? "No login", hint: g.userId ? undefined : "Create portal access from the directory" },
              { label: "Linked students", value: String(g.students.length) },
              { label: "Primary links", value: String(g.students.filter((s) => s.isPrimary).length) },
            ]}
          />
          <p style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--color-text-secondary)" }}>
            <HeartHandshake size={15} aria-hidden="true" /> Relationships are explicit — a guardian with no linked learner cannot receive child-scoped messages.
          </p>
        </ProductSection>
      </div>
    </AppShell>
  );
}
