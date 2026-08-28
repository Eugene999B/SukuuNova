import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PrismaClient } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import Link from "next/link";
import { GUARDIAN_COOKIE, getGuardianSession } from "@/lib/guardian-auth";
import { SCHOOL_COOKIE, getSchoolSession } from "@/lib/auth";

const db = new PrismaClient();

async function changePassword(formData: FormData) {
  "use server";
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (next.length < 8) throw new Error("New password must contain at least 8 characters.");
  if (next !== confirm) throw new Error("New passwords do not match.");
  const guardian = await getGuardianSession();
  const school = await getSchoolSession();
  if (guardian) {
    const user = await db.user.findUnique({ where: { id: guardian.userId }, select: { passwordHash: true } });
    if (!user || !(await compare(current, user.passwordHash))) throw new Error("Current password is incorrect.");
    await db.user.update({ where: { id: guardian.userId }, data: { passwordHash: await hash(next, 12) } });
    (await cookies()).delete(GUARDIAN_COOKIE);
    redirect("/login/guardian");
  }
  if (school) {
    const user = await db.user.findUnique({ where: { id: school.userId }, select: { passwordHash: true } });
    if (!user || !(await compare(current, user.passwordHash))) throw new Error("Current password is incorrect.");
    await db.user.update({ where: { id: school.userId }, data: { passwordHash: await hash(next, 12) } });
    redirect("/dashboard");
  }
  redirect("/");
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const guardian = await getGuardianSession();
  const school = await getSchoolSession();
  if (!guardian && !school) redirect("/");
  const required = (await searchParams).required === "1";
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#07121b", color: "#edf8f5", padding: 24 }}><section style={{ width: "min(100%,560px)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 24, background: "linear-gradient(145deg,#122733,#091722)", padding: 28, boxShadow: "0 30px 90px rgba(0,0,0,.28)" }}><span style={{ color: "#64e2bc", fontSize: 10, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase" }}>Account security</span><h1 style={{ fontSize: 36, margin: "9px 0", letterSpacing: "-.05em" }}>{required ? "Change your temporary password" : "Change password"}</h1><p style={{ color: "#82999d", lineHeight: 1.7, fontSize: 13 }}>{required ? "Your school provided a temporary password. Choose a private password before continuing to your portal." : "Keep your SukuuNova account protected with a password only you know."}</p><form action={changePassword} style={{ display: "grid", gap: 13, marginTop: 24 }}><label style={{ display: "grid", gap: 6, fontSize: 11, fontWeight: 800 }}>Current password<input name="currentPassword" type="password" autoComplete="current-password" required style={{ padding: 13, borderRadius: 12, border: "1px solid rgba(255,255,255,.09)", background: "#081620", color: "white" }} /></label><label style={{ display: "grid", gap: 6, fontSize: 11, fontWeight: 800 }}>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required style={{ padding: 13, borderRadius: 12, border: "1px solid rgba(255,255,255,.09)", background: "#081620", color: "white" }} /></label><label style={{ display: "grid", gap: 6, fontSize: 11, fontWeight: 800 }}>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required style={{ padding: 13, borderRadius: 12, border: "1px solid rgba(255,255,255,.09)", background: "#081620", color: "white" }} /></label><button type="submit" style={{ marginTop: 5, border: 0, borderRadius: 13, padding: 14, background: "linear-gradient(135deg,#35dfab,#63e6bf)", color: "#052019", fontWeight: 950, cursor: "pointer" }}>Update password →</button></form><div style={{ marginTop: 18, color: "#60797e", fontSize: 10 }}><Link href={guardian ? "/guardian" : "/dashboard"}>← Return to {guardian ? "guardian portal" : "workspace"}</Link></div></section></main>;
}
