import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { DetailGrid, ProductPageHeader, ProductSection, StatusBadge } from "@/components/product/ProductWorkspace";
import "@/components/product/product-workspace.css";

export default async function HouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, house] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.house.findFirst({
        where: { id, schoolId: session.schoolId },
        select: { id: true, name: true, code: true, color: true, description: true, isActive: true, students: { where: { status: "active" }, orderBy: { name: "asc" }, take: 50, select: { id: true, name: true, admissionNo: true, class: { select: { name: true } } } } },
      }),
    ]);
    const count = house ? await tx.student.count({ where: { schoolId: session.schoolId, houseId: house.id, status: "active" } }) : 0;
    return { school, house, count };
  });
  if (!data.school) notFound();
  if (!data.house) {
    return (
      <AppShell universe="school" title="House not found" subtitle="Houses workspace." active="Classes & Houses" schoolName="School Workspace" schoolCode="" userName={session.name}>
        <div className="product-workspace">
          <ProductPageHeader eyebrow="Houses" title="House not found" description="This house does not exist in your school." backHref="/school/classes" backLabel="Classes & Houses" />
        </div>
      </AppShell>
    );
  }
  const h = data.house;
  return (
    <AppShell universe="school" title={h.name} subtitle="House workspace — membership across classes." active="Classes & Houses" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <div className="product-workspace">
        <ProductPageHeader
          eyebrow={`House · ${h.code}`}
          title={h.name}
          description={h.description || "Pastoral community connecting learners across class groups."}
          backHref="/school/classes"
          backLabel="Classes & Houses"
          stats={[{ label: "Active members", value: String(data.count) }]}
          actions={<StatusBadge tone={h.isActive ? "success" : "neutral"}>{h.isActive ? "Active" : "Inactive"}</StatusBadge>}
        />
        <ProductSection eyebrow="Identity" title="House identity" description="How this house appears across the school.">
          <DetailGrid items={[{ label: "Name", value: h.name }, { label: "Code", value: h.code }, { label: "Colour", value: h.color ?? "—" }, { label: "Status", value: h.isActive ? "Active" : "Inactive" }]} />
          {h.description ? <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{h.description}</p> : null}
        </ProductSection>
        <ProductSection eyebrow="Membership" title={`Students (${data.count})`} description="First 50 active members alphabetically. Assign houses from Classes & Houses.">
          {h.students.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No active members yet. Assign learners to this house to build the community.</p>
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {h.students.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/school/students/${s.id}`}>{s.name}</Link>
                        <small style={{ display: "block", color: "var(--color-text-muted)" }}>{s.admissionNo}</small>
                      </td>
                      <td>{s.class?.name ?? "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ProductSection>
      </div>
    </AppShell>
  );
}
