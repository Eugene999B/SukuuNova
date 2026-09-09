import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "./biometric-readiness.css";

type Method = { kind: "face" | "fingerprint" | "card"; externalId?: string; enrolledAt?: Date };
type Row = { type: "student" | "staff"; id: string; name: string; meta: string; photoUrl: string | null; methods: Method[] };

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default async function BiometricReadinessPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "settings:manage_school");
    const [school, faceEnrollments, deviceIdentities] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.faceEnrollment.findMany({
        where: { schoolId: session.schoolId },
        select: { studentId: true, staffId: true, enrolledAt: true },
        orderBy: { enrolledAt: "desc" },
      }),
      tx.deviceIdentity.findMany({
        where: { schoolId: session.schoolId, deviceKind: { in: ["fingerprint", "card"] } },
        select: { studentId: true, staffId: true, deviceKind: true, externalId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    if (!school) return null;

    const studentIds = new Set<string>();
    const staffIds = new Set<string>();
    for (const enrollment of faceEnrollments) {
      if (enrollment.studentId) studentIds.add(enrollment.studentId);
      if (enrollment.staffId) staffIds.add(enrollment.staffId);
    }
    for (const identity of deviceIdentities) {
      if (identity.studentId) studentIds.add(identity.studentId);
      if (identity.staffId) staffIds.add(identity.staffId);
    }

    const [students, staff] = await Promise.all([
      studentIds.size ? tx.student.findMany({
        where: { schoolId: session.schoolId, id: { in: [...studentIds] } },
        select: { id: true, name: true, admissionNo: true, photoUrl: true, class: { select: { name: true } } },
        orderBy: { name: "asc" },
      }) : [],
      staffIds.size ? tx.user.findMany({
        where: { schoolId: session.schoolId, id: { in: [...staffIds] } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }) : [],
    ]);

    const methodsFor = (target: { studentId?: string; staffId?: string }): Method[] => {
      const methods: Method[] = [];
      const face = faceEnrollments.find((entry) => target.studentId ? entry.studentId === target.studentId : entry.staffId === target.staffId);
      if (face) methods.push({ kind: "face", enrolledAt: face.enrolledAt });
      for (const identity of deviceIdentities) {
        const matches = target.studentId ? identity.studentId === target.studentId : identity.staffId === target.staffId;
        if (!matches) continue;
        if (identity.deviceKind === "fingerprint" || identity.deviceKind === "card") methods.push({ kind: identity.deviceKind, externalId: identity.externalId, enrolledAt: identity.createdAt });
      }
      return methods;
    };

    const rows: Row[] = [
      ...students.map((student) => ({
        type: "student" as const,
        id: student.id,
        name: student.name,
        meta: `${student.admissionNo}${student.class?.name ? ` · ${student.class.name}` : ""}`,
        photoUrl: student.photoUrl,
        methods: methodsFor({ studentId: student.id }),
      })),
      ...staff.map((user) => ({
        type: "staff" as const,
        id: user.id,
        name: user.name,
        meta: user.email ?? "Staff account",
        photoUrl: null,
        methods: methodsFor({ staffId: user.id }),
      })),
    ].sort((a, b) => a.name.localeCompare(b.name));

    return { school, rows };
  });

  if (!data) return null;
  const faceCount = data.rows.filter((row) => row.methods.some((method) => method.kind === "face")).length;
  const fingerprintCount = data.rows.filter((row) => row.methods.some((method) => method.kind === "fingerprint")).length;
  const studentCount = data.rows.filter((row) => row.type === "student").length;
  const staffCount = data.rows.filter((row) => row.type === "staff").length;

  return <AppShell universe="school" title="Biometric Readiness" subtitle="People currently enrolled for face, fingerprint or card attendance." active="Devices" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
    <div className="biometric-readiness">
      <section className="biometric-readiness-hero"><div><span>Attendance identities</span><h2>Who can the attendance system recognize?</h2><p>This roster shows only identities that are actually enrolled or mapped. Face recognition uses encrypted provider references; fingerprint templates remain on the physical terminal and SukuuNova stores only the terminal enrollment ID.</p></div><div className="biometric-readiness-actions"><Link href="/school/devices">Attendance Control</Link><Link href="/school/students">Student profiles</Link></div></section>
      <div className="biometric-readiness-metrics"><div><span>Recognized people</span><strong>{data.rows.length}</strong></div><div><span>Face ready</span><strong>{faceCount}</strong></div><div><span>Fingerprint ready</span><strong>{fingerprintCount}</strong></div><div><span>Students / staff</span><strong>{studentCount} / {staffCount}</strong></div></div>
      <section className="biometric-roster">
        {data.rows.length ? <table><thead><tr><th>Person</th><th>Type</th><th>Recognized by</th><th>Enrollment details</th><th>Manage</th></tr></thead><tbody>{data.rows.map((row) => <tr key={`${row.type}-${row.id}`}><td><div className="biometric-person"><span className="biometric-person-avatar">{row.photoUrl ? <Image src={row.photoUrl} alt="" width={38} height={38} unoptimized /> : initials(row.name)}</span><span><strong>{row.name}</strong><small>{row.meta}</small></span></div></td><td>{row.type === "student" ? "Student" : "Staff"}</td><td><div className="biometric-methods">{row.methods.map((method, index) => <span className="biometric-method ready" key={`${method.kind}-${method.externalId ?? index}`}>{method.kind === "face" ? "Face" : method.kind === "fingerprint" ? "Fingerprint" : "Card"}</span>)}</div></td><td>{row.methods.map((method, index) => <div key={`${method.kind}-detail-${index}`}>{method.kind === "face" ? `Face enrolled ${method.enrolledAt ? new Date(method.enrolledAt).toLocaleDateString("en-GB") : ""}` : `${method.kind === "fingerprint" ? "Fingerprint" : "Card"} ID ${method.externalId}`}</div>)}</td><td>{row.type === "student" ? <Link href={`/school/students/${row.id}/biometrics`}>Open biometric identity</Link> : <Link href={`/school/settings/access?userId=${row.id}`}>Open staff access</Link>}</td></tr>)}</tbody></table> : <div className="biometric-empty">No face, fingerprint or card identities have been enrolled yet. Start from a learner profile or Attendance Control.</div>}
      </section>
    </div>
  </AppShell>;
}
