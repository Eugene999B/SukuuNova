"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Globe2,
  Headset,
  History,
  LockKeyhole,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
  WalletCards,
  Workflow,
} from "lucide-react";
import { PublicPresenceConsole } from "@/components/PublicPresenceConsole";
import "./platform-settings.css";

type Section = "overview" | "public" | "access" | "operations";

const navigation: Array<{ id: Section; label: string; description: string; icon: typeof Settings2 }> = [
  { id: "overview", label: "Overview", description: "Understand what each control governs", icon: Settings2 },
  { id: "public", label: "Public presence", description: "Brand, contact channels and homepage visibility", icon: Globe2 },
  { id: "access", label: "Access & governance", description: "Workers, school scope and auditability", icon: ShieldCheck },
  { id: "operations", label: "Operations", description: "Health, billing and support workflows", icon: SlidersHorizontal },
];

const links = {
  access: [
    { href: "/platform/admins", icon: UsersRound, title: "Workers & permissions", body: "Manage platform operators and least-privilege capabilities." },
    { href: "/platform/admins/access", icon: Workflow, title: "Worker school scope", body: "Control which school tenants each operator can access." },
    { href: "/platform/audit", icon: History, title: "Audit log", body: "Review sensitive administrative actions and investigation context." },
  ],
  operations: [
    { href: "/platform/health", icon: Activity, title: "System health", body: "Inspect service health and operational signals before making changes." },
    { href: "/platform/billing", icon: WalletCards, title: "Platform billing", body: "Manage invoices, payments and commercial status for schools." },
    { href: "/platform/support", icon: Headset, title: "Support", body: "Work tenant-scoped cases and record operator replies." },
  ],
};

export function PlatformSettingsWorkspace() {
  const [section, setSection] = useState<Section>("overview");
  const current = useMemo(() => navigation.find((item) => item.id === section) ?? navigation[0], [section]);

  return (
    <div className="platform-settings-workspace">
      <section className="app-card app-panel platform-settings-hero">
        <div className="platform-settings-hero-copy">
          <span className="app-eyebrow">CONTROL CENTER · GOVERNANCE</span>
          <h2>{current.label}</h2>
          <p>{current.description}. Settings are grouped by operational responsibility so common changes stay easy to find while higher-risk controls remain deliberate.</p>
        </div>
        <div className="platform-settings-state">
          <div className="platform-settings-state-icon"><CheckCircle2 size={18} aria-hidden="true" /></div>
          <div><strong>Protected workflow</strong><span>Privileged changes are permission-gated and auditable.</span></div>
        </div>
      </section>

      <div className="platform-settings-layout">
        <nav className="app-card platform-settings-nav" aria-label="Platform settings sections">
          <div className="platform-settings-nav-heading">Settings</div>
          {navigation.map((item) => {
            const Icon = item.icon;
            const selected = item.id === section;
            return (
              <button key={item.id} type="button" className={`platform-settings-nav-item ${selected ? "is-active" : ""}`} onClick={() => setSection(item.id)} aria-current={selected ? "page" : undefined}>
                <span className="platform-settings-nav-icon"><Icon size={16} aria-hidden="true" /></span>
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            );
          })}
          <div className="platform-settings-nav-foot">
            <CircleHelp size={14} aria-hidden="true" />
            <span>High-impact controls live in their dedicated workflow so permissions and audit context are visible.</span>
          </div>
        </nav>

        <div className="platform-settings-main">
          {section === "overview" && (
            <>
              <section className="app-dashboard-grid platform-settings-overview-grid">
                <div className="app-card app-panel platform-settings-summary-card">
                  <div className="app-card-head"><div><span className="app-eyebrow">SAFE DEFAULT</span><h3>Public configuration</h3><p>Manage the public-facing SukuuNova identity without mixing it with internal platform administration.</p></div><Globe2 size={20} aria-hidden="true" /></div>
                  <div className="platform-settings-action-row"><button type="button" className="app-action" onClick={() => setSection("public")}><strong>Open public presence</strong>Brand, contact and homepage controls</button></div>
                </div>
                <div className="app-card app-panel platform-settings-summary-card">
                  <div className="app-card-head"><div><span className="app-eyebrow">PRIVILEGED</span><h3>Access governance</h3><p>Do not configure operator permissions from a generic settings form. Use the dedicated scope and audit workflows.</p></div><LockKeyhole size={20} aria-hidden="true" /></div>
                  <div className="platform-settings-action-row"><button type="button" className="app-action" onClick={() => setSection("access")}><strong>Review governance</strong>Workers, school scope and audit</button></div>
                </div>
                <div className="app-card app-panel platform-settings-summary-card">
                  <div className="app-card-head"><div><span className="app-eyebrow">OPERATIONS</span><h3>Operational controls</h3><p>Keep health, commercial, and support actions close to the workflow where their impact can be verified.</p></div><SlidersHorizontal size={20} aria-hidden="true" /></div>
                  <div className="platform-settings-action-row"><button type="button" className="app-action" onClick={() => setSection("operations")}><strong>Open operations</strong>Health, billing and support</button></div>
                </div>
              </section>

              <section className="app-card app-panel platform-settings-principles">
                <div className="app-card-head"><div><span className="app-eyebrow">DESIGN PRINCIPLES</span><h3>How this control center behaves</h3><p>Common decisions are close to the task; advanced decisions are disclosed only when needed.</p></div></div>
                <div className="platform-settings-principle-grid">
                  <div><Search size={16} aria-hidden="true" /><strong>Find first</strong><span>Use global search and school workflows to locate the object before acting.</span></div>
                  <div><ShieldCheck size={16} aria-hidden="true" /><strong>Scope always visible</strong><span>Tenant access and privileged actions remain explicitly school-scoped.</span></div>
                  <div><History size={16} aria-hidden="true" /><strong>Verify after acting</strong><span>Audits, health checks and workflow states provide a traceable result.</span></div>
                </div>
              </section>
            </>
          )}

          {section === "public" && <PublicPresenceConsole />}

          {section === "access" && (
            <section className="app-dashboard-grid">
              {links.access.map(({ href, icon: Icon, title, body }) => (
                <Link key={href} href={href} className="app-card app-panel platform-settings-link-card">
                  <div className="platform-settings-link-icon"><Icon size={18} aria-hidden="true" /></div>
                  <div><span className="app-eyebrow">GOVERNANCE WORKFLOW</span><h3>{title}</h3><p>{body}</p></div>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </section>
          )}

          {section === "operations" && (
            <section className="app-dashboard-grid">
              {links.operations.map(({ href, icon: Icon, title, body }) => (
                <Link key={href} href={href} className="app-card app-panel platform-settings-link-card">
                  <div className="platform-settings-link-icon"><Icon size={18} aria-hidden="true" /></div>
                  <div><span className="app-eyebrow">OPERATIONAL WORKFLOW</span><h3>{title}</h3><p>{body}</p></div>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
