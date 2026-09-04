import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, Filter, Search, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { hasPlatformPermission, requirePlatformPermission } from "@/lib/platform-permissions";
import { requireSchoolScope } from "@/lib/platform-school-scope";
import { db, withTenant } from "@/lib/db";
import "@/components/platform-control-plane.css";

function severity(action: string) {
  return /delete|suspend|lock|password|permission|role|billing|imperson/i.test(action) ? "Sensitive" : /failed|error|revoked/i.test(action) ? "Warning" : "Activity";
}

type UnifiedEvent = {
  id: string;
  source: "School" | "Platform";
  actor: string;
  action: string;
  target: string | null;
  createdAt: Date;
  meta: unknown;
  level: string;
};

export default async function SchoolActivityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; sensitive?: string }> }) {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const { id } = await params;
  await requireSchoolScope(session, id);
  const paramsQuery = await searchParams;
  const query = paramsQuery.q?.trim().toLowerCase() ?? "";
  const sensitiveOnly = paramsQuery.sensitive === "1";
  const canAudit = await hasPlatformPermission(session, "audit.view");
  const data = await withTenant(id, async (tx) => {
    const school = await tx.school.findUnique({ where: { id }, select: { id: true, name: true, uniqueCode: true, status: true } });
    if (!school) return null;
    const where = query ? { OR: [{ action: { contains: query, mode: "insensitive" as const } }, { entityType: { contains: query, mode: "insensitive" as const } }, { entityId: { contains: query, mode: "insensitive" as const } }] } : undefined;
    const events = await tx.auditLogSchool.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    const actorIds = [...new Set(events.map((event) => event.actorId).filter(Boolean))];
    const actors = actorIds.length ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
    return { school, events, actors };
  });
  if (!data) notFound();
  const actorMap = new Map(data.actors.map((actor) => [actor.id, actor]));
  const schoolEvents: UnifiedEvent[] = data.events.map((event) => {
    const actor = actorMap.get(event.actorId);
    const target = event.entityType ? `${event.entityType}${event.entityId ? `:${event.entityId}` : ""}` : event.entityId || null;
    return { id: `school:${event.id}`, source: "School", actor: actor?.name ?? event.actorId ?? "System", action: event.action, target, createdAt: event.createdAt, meta: { before: event.before, after: event.after }, level: severity(event.action) };
  });
  const platformEvents: UnifiedEvent[] = canAudit ? (await db.$queryRawUnsafe<Array<{ id: string; actorId: string | null; actorName: string | null; action: string; targetEntity: string | null; createdAt: Date; meta: unknown }>>(`SELECT l."id",l."actorId",a."name" AS "actorName",l."action",l."targetEntity",l."createdAt",l."meta" FROM "AuditLogPlatform" l LEFT JOIN "PlatformAdmin" a ON a."id"=l."actorId" WHERE l."targetSchoolId"=$1 ORDER BY l."createdAt" DESC LIMIT 100`, id)).map((event) => ({ id: `platform:${event.id}`, source: "Platform", actor: event.actorName ?? event.actorId ?? "System", action: event.action, target: event.targetEntity, createdAt: event.createdAt, meta: event.meta, level: severity(event.action) })) : [];
  const combined = [...schoolEvents, ...platformEvents].filter((event) => !sensitiveOnly || event.level === "Sensitive").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return <AppShell universe="platform" title={`${data.school.name} · Activity`} subtitle="Investigate tenant activity across school users and platform operators, with sensitive events clearly surfaced." active="Schools">
    <section className="app-banner"><div><span className="app-eyebrow">SCHOOL ACTIVITY CENTER</span><h3>{data.school.name}</h3><p>{data.school.uniqueCode} · {data.school.status} · Unified tenant and platform evidence view</p></div><Link className="app-pill" href={`/platform/schools/${id}`}>Back to School 360</Link></section>
    <section className="app-card app-panel" style={{ padding: 18 }}><form style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "end" }}><label style={{ display: "grid", gap: 5, fontSize: 9, fontWeight: 850, color: "#607082" }}><span>Search activity, action or target</span><div style={{ display: "flex", gap: 7, alignItems: "center", border: "1px solid var(--sn-line)", borderRadius: 11, padding: "0 10px", background: "#fff" }}><Search size={14}/><input name="q" defaultValue={query} placeholder="e.g. student.created, payment, settings" style={{ border: 0, outline: 0, minHeight: 38, flex: 1, font: "inherit", color: "var(--sn-ink)" }}/></div></label><label style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 40, padding: "0 10px", border: "1px solid var(--sn-line)", borderRadius: 11, background: "#fff", fontSize: 9, fontWeight: 800 }}><input type="checkbox" name="sensitive" value="1" defaultChecked={sensitiveOnly}/>Sensitive only</label><button type="submit" className="app-action"><Filter size={14}/><strong>Filter</strong></button></form></section>
    <section className="app-card app-panel"><div className="app-card-head"><div><span className="app-eyebrow">EVIDENCE STREAM</span><h2>{combined.length.toLocaleString()} events</h2><p>School-level audit events and platform control actions are shown together so incidents can be reconstructed in context.</p></div><Activity size={20}/></div>{combined.length ? combined.map((event)=><details key={event.id} className="platform-activity-row" style={{ display: "block", padding: "13px 0", borderBottom: "1px solid var(--sn-line)" }}><summary style={{ cursor: "pointer", listStyle: "none", display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 12, alignItems: "center" }}><span className={`platform-status ${event.level === "Sensitive" ? "platform-status-critical" : event.level === "Warning" ? "platform-status-watch" : "platform-status-healthy"}`}>{event.level}</span><span style={{ display: "grid", gap: 3 }}><strong style={{ fontSize: 11 }}>{event.action}</strong><small style={{ fontSize: 9, color: "var(--sn-muted)" }}>{event.source} · {event.actor}{event.target ? ` · ${event.target}` : ""}</small></span><time style={{ fontSize: 9, color: "var(--sn-muted)" }}>{new Date(event.createdAt).toLocaleString()}</time></summary><div style={{ marginTop: 10, marginLeft: 102, padding: 12, borderRadius: 11, background: "#f7f9fc", border: "1px solid var(--sn-line)" }}><div style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 9.5, fontWeight: 800, color: "#607082" }}><ShieldAlert size={13}/>Event evidence</div><pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 9, lineHeight: 1.5, color: "#415268" }}>{JSON.stringify(event.meta ?? {}, null, 2)}</pre></div></details>) : <div className="platform-empty"><strong>No activity matches this investigation.</strong><span>Try a broader search or remove the sensitive-only filter.</span></div>}</section>
    <Link href={`/platform/schools/${id}`} className="app-pill"><ArrowLeft size={13}/>Return to School 360</Link>
  </AppShell>;
}
