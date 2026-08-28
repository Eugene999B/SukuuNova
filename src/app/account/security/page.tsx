import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PrismaClient } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import Link from "next/link";
import { GUARDIAN_COOKIE, getGuardianSession, createGuardianSessionToken } from "@/lib/guardian-auth";
import { getPlatformSession, getSchoolSession, createPlatformSessionToken, PLATFORM_COOKIE, SCHOOL_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { withTenant } from "@/lib/db";

const db = new PrismaClient();

async function changePassword(formData: FormData) {
  "use server";
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (next.length < 8) throw new Error("New password must contain at least 8 characters.");
  if (next !== confirm) throw new Error("New passwords do not match.");

  const guardian = await getGuardianSession();
  if (guardian) {
    await withTenant(guardian.schoolId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: guardian.userId }, select: { passwordHash: true } });
      if (!user || !(await compare(current, user.passwordHash))) throw new Error("Current password is incorrect.");
      await tx.user.update({ where: { id: guardian.userId }, data: { passwordHash: await hash(next, 12) } });
    });
    const responseCookies = await cookies();
    responseCookies.set(GUARDIAN_COOKIE, await createGuardianSessionToken({ ...guardian, needsPasswordChange: false }), sessionCookieOptions());
    redirect("/guardian");
  }

  const school = await getSchoolSession();
  if (school) {
    await withTenant(school.schoolId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: school.userId }, select: { passwordHash: true } });
      if (!user || !(await compare(current, user.passwordHash))) throw new Error("Current password is incorrect.");
      await tx.user.update({ where: { id: school.userId }, data: { passwordHash: await hash(next, 12) } });
    });
    redirect("/dashboard");
  }

  const platform = await getPlatformSession();
  if (platform) {
    const admin = await db.platformAdmin.findUnique({ where: { id: platform.adminId }, select: { passwordHash: true } });
    if (!admin || !(await compare(current, admin.passwordHash))) throw new Error("Current password is incorrect.");
    await db.platformAdmin.update({ where: { id: platform.adminId }, data: { passwordHash: await hash(next, 12) } });
    const responseCookies = await cookies();
    responseCookies.set(PLATFORM_COOKIE, await createPlatformSessionToken(platform), sessionCookieOptions());
    responseCookies.delete(SCHOOL_COOKIE);
    redirect("/platform");
  }
  redirect("/");
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const guardian = await getGuardianSession();
  const school = await getSchoolSession();
  const platform = await getPlatformSession();
  if (!guardian && !school && !platform) redirect("/");
  const required = (await searchParams).required === "1" || Boolean(guardian?.needsPasswordChange);
  const target = guardian ? "guardian portal" : school ? "school workspace" : "platform control";
  return <main style={{ minHeight:"100vh", display:"grid", placeItems:"center", background:"#07121b", color:"#edf8f5", padding:24 }}><section style={{ width:"min(100%,560px)", border:"1px solid rgba(255,255,255,.08)", borderRadius:24, background:"linear-gradient(145deg,#122733,#091722)", padding:28, boxShadow:"0 30px 90px rgba(0,0,0,.28)" }}><span style={{ color:"#64e2bc", fontSize:10, fontWeight:900, letterSpacing:".14em", textTransform:"uppercase" }}>Account security</span><h1 style={{ fontSize:36, margin:"9px 0", letterSpacing:"-.05em" }}>{required ? "Change your temporary password" : "Change password"}</h1><p style={{ color:"#82999d", lineHeight:1.7, fontSize:13 }}>{required ? "Your school provided a temporary password. Choose a private password before continuing to your portal." : "Keep your SukuuNova account protected with a password only you know."}</p><form action={changePassword} style={{ display:"grid", gap:13, marginTop:24 }}><label style={{ display:"grid", gap:6, fontSize:11, fontWeight:800 }}>Current password<input name="currentPassword" type="password" autoComplete="current-password" required style={{ padding:13, borderRadius:12, border:"1px solid rgba(255,255,255,.09)", background:"#081620", color:"white" }}/></label><label style={{ display:"grid", gap:6, fontSize:11, fontWeight:800 }}>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required style={{ padding:13, borderRadius:12, border:"1px solid rgba(255,255,255,.09)", background:"#081620", color:"white" }}/></label><label style={{ display:"grid", gap:6, fontSize:11, fontWeight:800 }}>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required style={{ padding:13, borderRadius:12, border:"1px solid rgba(255,255,255,.09)", background:"#081620", color:"white" }}/></label><button type="submit" style={{ marginTop:5, border:0, borderRadius:13, padding:14, background:"linear-gradient(135deg,#35dfab,#63e6bf)", color:"#052019", fontWeight:950, cursor:"pointer" }}>Update password →</button></form><div style={{ marginTop:18, color:"#60797e", fontSize:10 }}><Link href={guardian ? "/guardian" : school ? "/dashboard" : "/platform"}>← Return to {target}</Link></div></section></main>;
}
