import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/rbac";
import StudentBiometricWorkspace from "./StudentBiometricWorkspace";

export default async function StudentBiometricsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [student, faceEnrollment, fingerprints, canEnrollFace, canManageFingerprint] = await Promise.all([
      tx.student.findFirst({
        where: { id, schoolId: session.schoolId },
        select: {
          id: true,
          name: true,
          admissionNo: true,
          photoUrl: true,
          class: { select: { name: true } },
          school: { select: { name: true, uniqueCode: true } },
          guardians: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: { isPrimary: true, relationship: true, guardian: { select: { id: true, name: true } } },
          },
        },
      }),
      tx.faceEnrollment.findFirst({ where: { schoolId: session.schoolId, studentId: id }, orderBy: { enrolledAt: "desc" }, select: { enrolledAt: true } }),
      tx.deviceIdentity.findMany({ where: { schoolId: session.schoolId, studentId: id, deviceKind: "fingerprint" }, orderBy: { createdAt: "desc" }, select: { id: true, externalId: true, createdAt: true } }),
      hasPermission(tx, session.userId, "attendance:record"),
      hasPermission(tx, session.userId, "settings:manage_school"),
    ]);
    if (!student) return null;
    return { student, faceEnrollment, fingerprints, canEnrollFace, canManageFingerprint };
  });

  if (!data) notFound();
  return (
    <AppShell universe="school" title="Biometric identity" subtitle="Face and fingerprint attendance readiness for one learner." active="Students" schoolName={data.student.school.name} schoolCode={data.student.school.uniqueCode} userName={session.name}>
      <StudentBiometricWorkspace
        student={{ id: data.student.id, name: data.student.name, admissionNo: data.student.admissionNo, photoUrl: data.student.photoUrl, className: data.student.class?.name ?? null }}
        guardians={data.student.guardians.map((link) => ({ id: link.guardian.id, name: link.guardian.name, relationship: link.relationship, isPrimary: link.isPrimary }))}
        initialFaceEnrolledAt={data.faceEnrollment?.enrolledAt?.toISOString() ?? null}
        initialFingerprints={data.fingerprints.map((identity) => ({ id: identity.id, externalId: identity.externalId, createdAt: identity.createdAt.toISOString() }))}
        canEnrollFace={data.canEnrollFace}
        canManageFingerprint={data.canManageFingerprint}
      />
    </AppShell>
  );
}
