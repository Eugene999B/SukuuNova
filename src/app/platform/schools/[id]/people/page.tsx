import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import PlatformSchoolPeopleConsole from "./PlatformSchoolPeopleConsole";
import { requirePlatformSession } from "@/lib/auth";
import { hasPlatformPermission, requirePlatformPermission } from "@/lib/platform-permissions";
import { requireSchoolScope } from "@/lib/platform-school-scope";
import { withTenant } from "@/lib/db";
import "@/components/platform-control-plane.css";

export default async function PlatformSchoolPeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.view");
  const { id } = await params;
  await requireSchoolScope(session, id);
  const canImpersonate = await hasPlatformPermission(session, "schools.impersonate");
  const result = await withTenant(id, async (tx) => {
    const school = await tx.school.findUnique({ where: { id }, select: { id: true, name: true, uniqueCode: true, status: true } });
    if (!school) return null;
    const people = await tx.user.findMany({ orderBy: { name: "asc" }, take: 250, select: { id: true, name: true, email: true, phone: true, status: true, userRoles: { select: { role: { select: { name: true, key: true } } } } } });
    return { school, people: people.map((person) => ({ id: person.id, name: person.name, email: person.email, phone: person.phone, status: person.status, role: person.userRoles.map((item) => item.role.key || item.role.name).filter(Boolean).join(" · ") || "No assigned role" })) };
  });
  if (!result) notFound();
  return <AppShell universe="platform" title={`${result.school.name} · People`} subtitle="School-scoped people directory and controlled support access." active="Schools">
    <div className="app-banner"><div><span className="app-eyebrow">SCHOOL 360 · PEOPLE</span><h3>{result.school.name}</h3><p>{result.school.uniqueCode} · {result.school.status} · Platform operators stay within the selected school scope.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="app-pill" href={`/platform/schools/${encodeURIComponent(id)}`}>Back to School 360</Link><Link className="app-pill" href={`/platform/schools/${encodeURIComponent(id)}/activity`}>Activity Center</Link></div></div>
    <PlatformSchoolPeopleConsole schoolId={id} people={result.people} canImpersonate={canImpersonate} />
  </AppShell>;
}
