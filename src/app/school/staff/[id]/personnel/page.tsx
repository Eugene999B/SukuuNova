import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProductPageHeader } from "@/components/product/ProductWorkspace";
import { StaffPersonnelForm } from "@/components/staff/StaffPersonnelForm";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { isSchoolStaffAccount, isTeachingRoleKey, roleKeyForName } from "@/lib/authorization";
import { getStaffProfile } from "@/lib/staff-profile-service";
import "@/components/product/product-workspace.css";

export default async function StaffPersonnelPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "users:read");
    const [school, staff, profile, canEdit] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.user.findFirst({
        where: { id, schoolId: session.schoolId },
        select: { id: true, name: true, email: true, phone: true, status: true, userRoles: { select: { role: { select: { name: true, key: true } } } } },
      }),
      getStaffProfile(tx, session.schoolId, id),
      hasPermission(tx, session.userId, "users:write").catch(() => false),
    ]);
    if (!school || !staff || !isSchoolStaffAccount(staff.userRoles.map(({ role }) => role))) return null;
    return { school, staff, profile, canEdit };
  });
  if (!data) notFound();

  const roleKeys = data.staff.userRoles.map(({ role }) => role.key?.trim() || roleKeyForName(role.name));
  const defaultStaffType = roleKeys.some((key) => isTeachingRoleKey(key)) ? "teaching" : "non-teaching";
  const profile = data.profile;
  const initial = {
    staffNumber: profile?.staffNumber ?? "",
    gender: profile?.gender ?? "",
    dob: profile?.dob ? new Date(profile.dob).toISOString().slice(0, 10) : "",
    nationality: profile?.nationality ?? "",
    dateJoined: profile?.dateJoined ? new Date(profile.dateJoined).toISOString().slice(0, 10) : "",
    staffType: profile?.staffType ?? defaultStaffType,
    staffCategory: profile?.staffCategory ?? "",
    jobTitle: profile?.jobTitle ?? data.staff.userRoles[0]?.role.name ?? "",
    department: profile?.department ?? "",
    employmentStatus: profile?.employmentStatus ?? "active",
    employmentType: profile?.employmentType ?? "",
    highestQualification: profile?.highestQualification ?? "",
    professionalQualification: profile?.professionalQualification ?? "",
    residentialAddress: profile?.residentialAddress ?? "",
    emergencyContactName: profile?.emergencyContactName ?? "",
    emergencyContactPhone: profile?.emergencyContactPhone ?? "",
    emergencyContactRelationship: profile?.emergencyContactRelationship ?? "",
    notes: profile?.notes ?? "",
  };

  return <AppShell universe="school" title={`${data.staff.name} · Personnel`} subtitle="Demographics, employment, qualifications and emergency information." active="Staff & Teachers" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="product-workspace">
      <ProductPageHeader
        eyebrow={`Personnel record${profile?.staffNumber ? ` · ${profile.staffNumber}` : ""}`}
        title={data.staff.name}
        description="This record supports HR and workforce statistics. Login roles, passwords and teaching assignments remain managed separately."
        backHref={`/school/staff/${encodeURIComponent(data.staff.id)}`}
        backLabel="Staff profile"
        actions={<Link className="button secondary" href="/school/staff">Staff directory</Link>}
      />
      <StaffPersonnelForm staffId={data.staff.id} staffName={data.staff.name} initial={initial} canEdit={data.canEdit}/>
    </div>
  </AppShell>;
}
