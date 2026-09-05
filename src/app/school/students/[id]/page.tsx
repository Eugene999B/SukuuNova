import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { BookOpenCheck, CalendarCheck2, FileBadge2, HeartHandshake, IdCard, PencilLine, ReceiptText, WalletCards } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { DetailGrid, ProductEmpty, ProductPageHeader, ProductSection, StatusBadge } from "@/components/product/ProductWorkspace";
import { StudentPrintActions } from "@/components/product/StudentPrintActions";
import "@/components/product/product-workspace.css";

function money(value: unknown): Prisma.Decimal {
  return new Prisma.Decimal(String(value ?? 0));
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  if (status === "withdrawn" || status === "archived") return "danger";
  if (status === "graduated") return "info";
  return "neutral";
}

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolSession();
  const { id } = await params;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const student = await tx.student.findFirst({
      where: { id, schoolId: session.schoolId },
      select: {
        id: true,
        name: true,
        admissionNo: true,
        dob: true,
        status: true,
        photoUrl: true,
        house: { select: { id: true, name: true, code: true, color: true } },
        school: { select: { name: true, uniqueCode: true } },
        class: { select: { id: true, name: true, level: true, classTeacher: { select: { name: true } } } },
        guardians: {
          select: {
            relationship: true,
            isPrimary: true,
            guardian: { select: { id: true, name: true, phone: true, email: true, userId: true, user: { select: { status: true } } } },
          },
        },
        scores: { orderBy: { enteredAt: "desc" }, take: 6, select: { value: true, enteredAt: true, assessment: { select: { name: true, type: true } }, subject: { select: { name: true } } } },
        attendanceEvents: { orderBy: { timestamp: "desc" }, take: 8, select: { type: true, timestamp: true, attendanceDate: true, isLate: true } },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, totalAmount: true, status: true, term: { select: { name: true } }, payments: { select: { amount: true, reversals: { select: { amount: true } } } } },
        },
        reportCards: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, term: { select: { name: true } } } },
        identityCards: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, serial: true, status: true, expiresAt: true } },
        _count: { select: { reportCards: true, invoices: true, attendanceEvents: true, scores: true } },
      },
    });
    if (!student) return null;
    const [scoreAvg, attendanceByType] = await Promise.all([
      tx.score.aggregate({ where: { schoolId: session.schoolId, studentId: id }, _avg: { value: true } }),
      tx.attendanceEvent.groupBy({ by: ["type"], where: { schoolId: session.schoolId, studentId: id }, _count: { _all: true } }),
    ]);
    return { student, scoreAvg, attendanceByType };
  });
  if (!data) notFound();

  const { student } = data;
  const attendance = Object.fromEntries(data.attendanceByType.map((r) => [r.type, r._count._all]));
  const average = student.scores.length || data.scoreAvg._avg.value != null ? Number(data.scoreAvg._avg.value ?? 0).toFixed(1) : null;
  const billed = student.invoices.reduce((s, inv) => s.plus(money(inv.totalAmount)), new Prisma.Decimal(0));
  const paid = student.invoices.reduce(
    (s, inv) =>
      s.plus(
        inv.payments.reduce(
          (p, pay) => p.plus(money(pay.amount)).minus(pay.reversals.reduce((r, rev) => r.plus(money(rev.amount)), new Prisma.Decimal(0))),
          new Prisma.Decimal(0)
        )
      ),
    new Prisma.Decimal(0)
  );
  const balance = Prisma.Decimal.max(0, billed.minus(paid));
  const primaryGuardian = student.guardians.find((g) => g.isPrimary)?.guardian ?? student.guardians[0]?.guardian ?? null;

  return (
    <AppShell
      universe="school"
      title={student.name}
      subtitle="Central learner workspace — identity, academics, family, attendance, finance and credentials."
      active="Students"
      schoolName={student.school.name}
      schoolCode={student.school.uniqueCode}
      userName={session.name}
    >
      <div className="product-workspace">
        <ProductPageHeader
          eyebrow="Learner workspace"
          title={student.name}
          description={`${student.class?.level ? `${student.class.level} · ` : ""}${student.class?.name ?? "Awaiting class placement"} · Index ${student.admissionNo}`}
          backHref="/school/students"
          backLabel="Students"
          stats={[
            { label: "Academic average", value: average ? `${average}%` : "—", hint: student._count.scores ? `${student._count.scores} scores` : "No results yet" },
            { label: "Attendance events", value: String(student._count.attendanceEvents), hint: `${attendance.in ?? 0} in · ${attendance.late ?? 0} late` },
            { label: "Outstanding", value: `GH₵${balance.toFixed(2)}`, hint: `${student._count.invoices} invoices` },
          ]}
          actions={
            <>
              <Link className="button secondary" href={`/school/students/${student.id}/edit`}>
                <PencilLine size={15} aria-hidden="true" /> Edit profile
              </Link>
              <StudentPrintActions studentId={student.id} studentName={student.name} />
              <Link className="button primary" href="/school/id-cards">
                <IdCard size={15} aria-hidden="true" /> ID cards
              </Link>
            </>
          }
        />

        <ProductSection eyebrow="Identity" title="Student identity" description="Who this learner is, where they belong, and their enrolment state.">
          <div className="product-profile-hero">
            <div className="product-avatar" aria-hidden="true">
              {student.photoUrl ? <Image src={student.photoUrl} alt="" width={72} height={72} unoptimized /> : student.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <StatusBadge tone={statusTone(student.status)}>{student.status}</StatusBadge>
              <p style={{ margin: "8px 0 0", color: "var(--color-text-secondary)", fontSize: 13 }}>
                {student.house ? `House ${student.house.name} (${student.house.code}) · ` : "No house assigned · "}
                {student.class?.classTeacher ? `Form teacher ${student.class.classTeacher.name}` : "No form teacher assigned"}
              </p>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <DetailGrid
              items={[
                { label: "Full name", value: student.name },
                { label: "Index number", value: student.admissionNo, hint: "Permanent learner identifier" },
                { label: "Class", value: student.class ? `${student.class.level ? `${student.class.level} · ` : ""}${student.class.name}` : "Unassigned", hint: student.class ? undefined : "Place this learner to unlock class workflows" },
                { label: "House", value: student.house?.name ?? "—", hint: student.house ? student.house.code : "Assign from Classes & Houses" },
                { label: "Date of birth", value: student.dob ? new Date(student.dob).toLocaleDateString("en-GB") : "—" },
                { label: "Status", value: student.status, hint: "Withdrawn learners keep history; never delete" },
              ]}
            />
          </div>
        </ProductSection>

        <ProductSection
          eyebrow="Academics"
          title="Academic summary"
          description="Recent performance and published report cards. Full mark entry lives in the Gradebook studio."
          actions={
            <Link className="button secondary" href="/school/gradebook/studio">
              <BookOpenCheck size={15} aria-hidden="true" /> Open gradebook
            </Link>
          }
        >
          {student.scores.length === 0 ? (
            <ProductEmpty icon={BookOpenCheck} title="No scores yet" description="When teachers record marks for this learner, the latest six appear here with subject and assessment context." />
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Subject</th>
                    <th scope="col">Assessment</th>
                    <th scope="col">Score</th>
                    <th scope="col">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {student.scores.map((s, i) => (
                    <tr key={`${s.assessment.name}-${i}`}>
                      <td>{s.subject.name}</td>
                      <td>
                        {s.assessment.name} <small style={{ color: "var(--color-text-muted)" }}>· {s.assessment.type}</small>
                      </td>
                      <td>{String(s.value)}</td>
                      <td>{new Date(s.enteredAt).toLocaleDateString("en-GB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {student.reportCards.length === 0 ? (
              <small style={{ color: "var(--color-text-muted)" }}>No report cards generated yet.</small>
            ) : (
              student.reportCards.map((r) => (
                <span key={r.id}>
                  <StatusBadge tone={r.status === "sent" ? "success" : r.status === "approved" ? "info" : "neutral"}>
                    {r.term.name} · {r.status}
                  </StatusBadge>{" "}
                </span>
              ))
            )}
            <Link href="/school/report-cards" className="text-link" style={{ fontSize: 13 }}>
              Open report card studio →
            </Link>
          </div>
        </ProductSection>

        <ProductSection
          eyebrow="Family"
          title="Guardians & portal access"
          description="Who may collect this learner, receive messages, and sign into the guardian portal."
          actions={
            <Link className="button secondary" href={`/school/guardians?student=${student.id}`}>
              <HeartHandshake size={15} aria-hidden="true" /> Manage guardians
            </Link>
          }
        >
          {student.guardians.length === 0 ? (
            <ProductEmpty
              icon={HeartHandshake}
              title="No guardians linked"
              description="Link at least one guardian so attendance, fees and report cards reach a family contact. Portal access requires a verified phone number."
              action={
                <Link className="button primary" href={`/school/guardians?student=${student.id}`}>
                  Link guardian
                </Link>
              }
            />
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Guardian</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Relationship</th>
                    <th scope="col">Portal</th>
                  </tr>
                </thead>
                <tbody>
                  {student.guardians.map((link) => (
                    <tr key={link.guardian.id}>
                      <td>
                        <Link href={`/school/guardians/${link.guardian.id}`}>{link.guardian.name}</Link>
                        {link.isPrimary ? <small style={{ color: "var(--color-text-muted)" }}> · Primary</small> : null}
                      </td>
                      <td>
                        {link.guardian.phone ?? "—"}
                        {link.guardian.email ? <small style={{ display: "block", color: "var(--color-text-muted)" }}>{link.guardian.email}</small> : null}
                      </td>
                      <td>{link.relationship}</td>
                      <td>
                        {link.guardian.userId ? (
                          <StatusBadge tone={link.guardian.user?.status === "active" ? "success" : "warning"}>
                            {link.guardian.user?.status ?? "pending"}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">No portal account</StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {primaryGuardian ? (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              Primary contact: {primaryGuardian.name} · {primaryGuardian.phone ?? "no phone on record"}
            </p>
          ) : null}
        </ProductSection>

        <ProductSection
          eyebrow="Attendance"
          title="Attendance"
          description="Latest check-ins for this learner. Full history and corrections live in Attendance."
          actions={
            <Link className="button secondary" href="/school/attendance">
              <CalendarCheck2 size={15} aria-hidden="true" /> Open attendance
            </Link>
          }
        >
          {student.attendanceEvents.length === 0 ? (
            <ProductEmpty icon={CalendarCheck2} title="No attendance yet" description="Once daily or period check-ins are recorded, the latest eight appear here." />
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Type</th>
                    <th scope="col">Late</th>
                  </tr>
                </thead>
                <tbody>
                  {student.attendanceEvents.map((e, i) => (
                    <tr key={`${e.timestamp}-${i}`}>
                      <td>{new Date(e.attendanceDate).toLocaleDateString("en-GB")}</td>
                      <td>{e.type}</td>
                      <td>{e.isLate ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ProductSection>

        <ProductSection
          eyebrow="Finance"
          title="Fees & balance"
          description="Invoices, net payments after reversals, and what is still owed. Money is shown net of approved reversals."
          actions={
            <Link className="button secondary" href="/school/fees">
              <WalletCards size={15} aria-hidden="true" /> Open finance
            </Link>
          }
        >
          <DetailGrid
            items={[
              { label: "Billed", value: `GH₵${billed.toFixed(2)}` },
              { label: "Paid (net)", value: `GH₵${paid.toFixed(2)}`, hint: "After reversals" },
              { label: "Outstanding", value: `GH₵${balance.toFixed(2)}`, hint: balance.gt(0) ? "Action required" : "Settled" },
            ]}
          />
          {student.invoices.length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <ProductEmpty icon={ReceiptText} title="No invoices" description="Generate an invoice for the learner's term to start the fee workflow." />
            </div>
          ) : (
            <div className="product-table-wrap" style={{ marginTop: 12 }}>
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Term</th>
                    <th scope="col">Total</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {student.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.term.name}</td>
                      <td>GH₵{money(inv.totalAmount).toFixed(2)}</td>
                      <td>
                        <StatusBadge tone={inv.status === "paid" ? "success" : inv.status === "partial" ? "warning" : "neutral"}>{inv.status}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ProductSection>

        <ProductSection
          eyebrow="Credentials"
          title="Documents & identity"
          description="Printable identity credential for this learner. SukuuNova does not store ad-hoc files on the learner record; the signed ID card is the source of truth."
          actions={
            <Link className="button secondary" href="/school/id-cards">
              <FileBadge2 size={15} aria-hidden="true" /> All ID cards
            </Link>
          }
        >
          {student.identityCards.length === 0 ? (
            <ProductEmpty icon={FileBadge2} title="No identity card yet" description="Identity cards are issued automatically for active learners. Open School ID cards to issue and print." />
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th scope="col">Serial</th>
                    <th scope="col">Status</th>
                    <th scope="col">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {student.identityCards.map((c) => (
                    <tr key={c.id}>
                      <td>{c.serial}</td>
                      <td>
                        <StatusBadge tone={c.status === "active" ? "success" : "danger"}>{c.status}</StatusBadge>
                      </td>
                      <td>{new Date(c.expiresAt).toLocaleDateString("en-GB")}</td>
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
