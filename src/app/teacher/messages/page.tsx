import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { getSchoolAuthorization } from "@/lib/authorization";

export default async function TeacherMessagesPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const access = await getSchoolAuthorization(tx, session.userId);
    if (access.workspace !== "teacher") return null;
    const [school, messages] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.message.findMany({
        where: { schoolId: session.schoolId, channel: "in_app", recipientType: "user", recipientId: session.userId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, body: true, status: true, createdAt: true, sentAt: true },
      }),
    ]);
    return { school, messages };
  });
  if (!data) redirect("/dashboard");
  return <AppShell universe="teacher" title="My messages" subtitle="School messages addressed directly to your teacher account." active="Teacher Home" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="staff-workspace" style={{ maxWidth: 1180, margin: "0 auto" }}>
      <section className="staff-card">
        <div className="staff-card-head"><div><span>MY INBOX</span><h3>Messages for {session.name}</h3><p>Only messages addressed to this account are shown here.</p></div><Link href="/teacher" className="staff-link-grid">Back to teacher workspace →</Link></div>
        {data.messages.length ? <div className="staff-role-stack">{data.messages.map((message) => { const [title, ...rest] = message.body.split("\n\n"); return <article key={message.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><div><strong>{title || "School message"}</strong><p style={{ margin: "5px 0 0", whiteSpace: "pre-wrap" }}>{rest.join("\n\n") || message.body}</p></div><span>{new Date(message.sentAt ?? message.createdAt).toLocaleString("en-GH")}</span></div></article>; })}</div> : <div style={{ padding: 36, textAlign: "center" }}><strong>No messages yet.</strong><p style={{ margin: "6px 0 0" }}>Messages sent directly to your account will appear here.</p></div>}
      </section>
    </div>
  </AppShell>;
}