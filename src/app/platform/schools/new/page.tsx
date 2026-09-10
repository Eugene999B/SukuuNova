import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CreditCard, KeyRound, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SchoolOnboardingForm } from "@/components/SchoolOnboardingForm";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";

const steps = [
  { icon: Building2, title: "School identity", body: "Name, login code, type, location and school contact details." },
  { icon: KeyRound, title: "Owner & leadership", body: "Create accountable school operators with forced first-login password changes." },
  { icon: CreditCard, title: "Commercial setup", body: "Choose the billing model, rate, grace period and trial posture explicitly." },
  { icon: ShieldCheck, title: "Operational baseline", body: "Create tenant settings, roles, permissions, audit history and messaging wallet atomically." },
];

export default async function NewSchoolPage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "schools.manage");
  if (session.role !== "super_admin") redirect("/platform/schools");

  return <AppShell universe="platform" title="Onboard School" subtitle="Create a complete tenant with accountable access and an explicit operating baseline." active="Schools" userName={session.name} role={session.role}>
    <div className="platform-v3">
      <section className="platform-v3-hero">
        <div className="platform-v3-hero-copy"><span className="platform-eyebrow">School onboarding</span><h2>Create the tenant once, correctly.</h2><p>This workflow provisions the school identity, owner access, default roles, commercial configuration and audit trail together. Nothing is silently assumed later.</p></div>
        <div className="platform-v3-actions"><Link className="app-pill" href="/platform/schools">Back to school network</Link></div>
      </section>

      <div className="platform-onboard-v3">
        <section className="platform-onboard-v3-main"><SchoolOnboardingForm /></section>
        <aside className="platform-onboard-v3-side">
          <section className="platform-v3-panel"><div className="platform-v3-panel-head"><div><span className="platform-eyebrow">Provisioning path</span><h3>What this creates</h3><p>Four deliberate stages, one atomic tenant handoff.</p></div></div>{steps.map(({ icon: Icon, title, body }, index) => <div className="platform-onboard-v3-step" key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{title}</b><small>{body}</small></div><Icon size={15}/></div>)}</section>
          <section className="platform-v3-panel"><div className="platform-v3-panel-head"><div><span className="platform-eyebrow">Security</span><h3>One-time credential handoff</h3></div></div><div className="platform-school360-v3-clear"><ShieldCheck size={17}/><div><b>Temporary credentials are shown only after creation.</b><span>School leaders must replace temporary passwords on first login. Do not share one account between people.</span></div></div></section>
        </aside>
      </div>
    </div>
  </AppShell>;
}
