import Link from "next/link";
import { redirect } from "next/navigation";
import { withTenant } from "@/lib/db";
import { requireSchoolSession } from "@/lib/school-auth";
import AnnouncementComposer from "./AnnouncementComposer";
import "@/app/globals.css";

export default async function AnnouncementsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [account, roles, users] = await Promise.all([
      tx.user.findUnique({ where: { id: session.userId }, select: { name: true, userRoles: { select: { role: { select: { name: true } } } } } }),
      tx.role.findMany({ where: {}, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.user.findMany({ where: { status: "active" }, select: { id: true, name: true, userRoles: { select: { role: { select: { name: true } } } } }, orderBy: { name: "asc" } })
    ]);
    return { account, roles, users: users.map((user) => ({ id: user.id, name: user.name, roleNames: user.userRoles.map((item) => item.role.name) })) };
  });
  if (!data.account) redirect("/login/school");

  return <main className="app-shell app-shell-school">
    <aside className="app-sidebar"><Link href="/" className="app-brand"><span className="app-brand-mark">S</span><span><strong>SukuuNova</strong><small>School Workspace</small></span></Link><div className="app-school-chip"><span className="app-chip-avatar">{data.account.name.slice(0,2).toUpperCase()}</span><span><b>School Workspace</b><small>Communication centre</small></span></div></aside>
    <section className="app-main"><header className="app-topbar"><div><div className="app-breadcrumb">SukuuNova <span>›</span> Communications</div><h1>Announcements</h1><p>Publish one clear message to the people who need it without spending an SMS credit.</p></div><div className="app-top-actions"><Link className="app-search" href="/school/search">⌕ Search anything <kbd>⌘ K</kbd></Link></div></header><div className="app-content">
      <div className="module-topline"><div><span className="module-overline">Communication centre</span><h2>Reach the right people.</h2><p>Internal announcements are stored as in-app messages, scoped to this school, and written to the audit trail.</p></div><Link className="module-secondary-button" href="/dashboard">← Overview</Link></div>
      <AnnouncementComposer roles={data.roles} users={data.users} />
      <section className="module-card" style={{ marginTop: 14 }}><div className="module-section-title"><div><span>Delivery strategy</span><h3>Keep everyday communication inside the portal</h3><p>Use announcements and direct messages for routine school communication; use SMS or WhatsApp only when the school needs an external channel.</p></div></div><div className="module-linked-grid"><Link href="/school/communications/messages">Direct messages <span>→</span></Link><Link href="/school/communications/broadcasts">SMS / WhatsApp <span>→</span></Link><Link href="/school/events">Events & calendar <span>→</span></Link><Link href="/school/communications/settings">Communication settings <span>→</span></Link></div></section>
    </div></section>
  </main>;
}
