"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleHelp, Layers3, Plus, RefreshCw, Search, Sparkles } from "lucide-react";

type Plan = { id: string; name: string; price: string | number; featureFlags: unknown };
type School = { id: string; name: string; uniqueCode: string; status: string; subscriptionPlan?: { id: string; name: string; price: string | number; featureFlags?: unknown } | null };

const FEATURE_GROUPS = [
  { label: "Core operations", description: "Daily school administration and foundational workflows.", items: [{ key: "attendance", label: "Attendance" }, { key: "finance", label: "Finance" }, { key: "report_cards", label: "Report cards" }] },
  { label: "School life", description: "Experiences that extend beyond the core register and finance workflows.", items: [{ key: "transport", label: "Transport" }, { key: "feeding", label: "Feeding" }, { key: "library", label: "Library" }] },
  { label: "Advanced", description: "Higher-complexity capabilities for mature school operations.", items: [{ key: "exams", label: "Exams & assessments" }, { key: "payroll", label: "Payroll" }, { key: "analytics", label: "Analytics" }] },
];

const ALL_FEATURES = FEATURE_GROUPS.flatMap((group) => group.items);

function flagsOf(plan: Plan | School["subscriptionPlan"] | null | undefined): string[] {
  return Array.isArray(plan?.featureFlags) ? plan.featureFlags.filter((value): value is string => typeof value === "string") : [];
}

function money(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `₵${amount.toLocaleString()}` : "₵0";
}

export default function PlanManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [flags, setFlags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [schoolQuery, setSchoolQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const [plansResponse, schoolsResponse] = await Promise.all([
        fetch("/api/platform/phase4?view=plans", { cache: "no-store" }),
        fetch("/api/platform/phase4?view=schools", { cache: "no-store" }),
      ]);
      if (plansResponse.ok) {
        const data = await plansResponse.json() as { plans?: Plan[] };
        setPlans(Array.isArray(data.plans) ? data.plans : []);
      }
      if (schoolsResponse.ok) {
        const data = await schoolsResponse.json() as { schools?: School[] };
        setSchools(Array.isArray(data.schools) ? data.schools : []);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createPlan() {
    const trimmedName = name.trim();
    const numericPrice = Number(price);
    if (!trimmedName) { setMessage("Give the plan a name first."); return; }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) { setMessage("Enter a valid monthly price."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/platform/phase4", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createPlan", name: trimmedName, price: numericPrice, featureFlags: flags }),
      });
      const data = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? `Plan “${trimmedName}” created.` : (data.message ?? data.error ?? "Unable to create plan."));
      if (response.ok) { setName(""); setPrice(""); setFlags([]); await load(); }
    } finally {
      setBusy(false);
    }
  }

  async function assignPlan(schoolId: string, planId: string) {
    if (!planId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/platform/phase4", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "assignPlan", schoolId, planId }),
      });
      const data = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? "Subscription assignment updated and audited." : (data.message ?? data.error ?? "Unable to assign plan."));
      if (response.ok) await load();
    } finally {
      setBusy(false);
    }
  }

  const visiblePlans = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((plan) => !q || plan.name.toLowerCase().includes(q));
  }, [plans, query]);

  const visibleSchools = useMemo(() => {
    const q = schoolQuery.trim().toLowerCase();
    return schools.filter((school) => !q || school.name.toLowerCase().includes(q) || school.uniqueCode.toLowerCase().includes(q));
  }, [schools, schoolQuery]);

  const assignedCount = useMemo(() => plans.reduce((count, plan) => count + schools.filter((school) => school.subscriptionPlan?.id === plan.id).length, 0), [plans, schools]);

  return (
    <div style={{ display: "grid", gap: 18, marginTop: 20 }}>
      {message ? <div className="app-banner" role="status"><div><h3>{message}</h3><p>Platform configuration changes are controlled by permissions and audited.</p></div><span className="app-pill">Audited</span></div> : null}
      <div className="app-grid kpis">
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Plans</span><span className="app-kpi-icon"><Layers3 size={17}/></span></div><div className="app-kpi-value">{plans.length}</div><div className="app-kpi-meta">Live subscription records</div></div>
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Schools assigned</span><span className="app-kpi-icon"><Check size={17}/></span></div><div className="app-kpi-value">{assignedCount}</div><div className="app-kpi-meta">Current school-to-plan assignments</div></div>
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Unassigned</span><span className="app-kpi-icon"><CircleHelp size={17}/></span></div><div className="app-kpi-value">{Math.max(0, schools.length - assignedCount)}</div><div className="app-kpi-meta">Schools without a plan</div></div>
        <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Feature catalog</span><span className="app-kpi-icon"><Sparkles size={17}/></span></div><div className="app-kpi-value">{ALL_FEATURES.length}</div><div className="app-kpi-meta">Defined platform capabilities</div></div>
      </div>
      <section className="app-card app-panel" style={{ padding: 20 }}>
        <div className="app-card-head"><div><h2>Plan catalog</h2><p>Real subscription records, adoption, pricing and entitlements in one operational view.</p></div><button type="button" className="app-pill" onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}><label style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 260px", minWidth: 220, border: "1px solid var(--sn-line)", borderRadius: 12, padding: "9px 11px", background: "var(--sn-surface)" }}><Search size={15} color="var(--sn-muted)"/><input aria-label="Search plans" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans" style={{ border: 0, outline: 0, background: "transparent", width: "100%", font: "inherit" }}/></label><span className="app-pill">{visiblePlans.length} shown</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(200px,1.4fr) 130px 150px minmax(220px,1fr)", gap: 12, padding: "10px 12px", borderBottom: "1px solid var(--sn-line)", color: "var(--sn-muted)", fontSize: 9, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".08em" }}><span>Plan</span><span>Price</span><span>Adoption</span><span>Entitlements</span></div>
        {visiblePlans.map((plan) => { const planFlags = flagsOf(plan); const adoption = schools.filter((school) => school.subscriptionPlan?.id === plan.id).length; return <div key={plan.id} style={{ display: "grid", gridTemplateColumns: "minmax(200px,1.4fr) 130px 150px minmax(220px,1fr)", gap: 12, alignItems: "center", padding: "15px 12px", borderBottom: "1px solid var(--sn-line)" }}><div><b style={{ display: "block", fontSize: 13 }}>{plan.name}</b><span style={{ display: "block", marginTop: 3, fontSize: 10, color: "var(--sn-muted)" }}>{planFlags.length ? `${planFlags.length} features enabled` : "Core-only package"}</span></div><strong style={{ fontSize: 12 }}>{money(plan.price)}<span style={{ color: "var(--sn-muted)", fontWeight: 600 }}> / mo</span></strong><span className="app-pill">{adoption} schools</span><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{planFlags.map((flag) => <span key={flag} className="app-pill" style={{ fontSize: 9 }}>{flag.replaceAll("_", " ")}</span>)}</div></div>; })}
        {visiblePlans.length === 0 ? <div style={{ padding: 32, textAlign: "center", color: "var(--sn-muted)" }}>No plans match this search.</div> : null}
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(360px,.95fr)", gap: 18 }}>
        <section className="app-card app-panel" style={{ padding: 20 }}><div className="app-card-head"><div><h2>Create a plan</h2><p>Package actual product capabilities into a subscription tier.</p></div></div><div style={{ display: "grid", gap: 10 }}><input aria-label="Plan name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Plan name, e.g. Growth"/><div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}><input aria-label="Monthly price" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Monthly price" type="number" min="0" step="0.01"/><span className="app-pill">GHS / month</span></div>{FEATURE_GROUPS.map((group) => <div key={group.label} style={{ border: "1px solid var(--sn-line)", borderRadius: 14, padding: 12 }}><div style={{ marginBottom: 8 }}><b style={{ fontSize: 11 }}>{group.label}</b><p style={{ margin: "3px 0 0", color: "var(--sn-muted)", fontSize: 10 }}>{group.description}</p></div><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 7 }}>{group.items.map((item) => <label key={item.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 8px", border: "1px solid var(--sn-line)", borderRadius: 9, fontSize: 10 }}><input type="checkbox" checked={flags.includes(item.key)} onChange={(event) => setFlags((current) => event.target.checked ? [...current, item.key] : current.filter((flag) => flag !== item.key))}/>{item.label}</label>)}</div></div>)}<button type="button" className="app-action" onClick={() => void createPlan()} disabled={busy || !name.trim()}><Plus size={14}/><strong>Create plan</strong>Save platform package</button></div></section>
        <section className="app-card app-panel" style={{ padding: 20 }}><div className="app-card-head"><div><h2>Assign entitlements</h2><p>Change a school’s subscription without leaving the control center.</p></div></div><div style={{ display: "grid", gap: 10, marginBottom: 12 }}><input aria-label="Search schools" value={schoolQuery} onChange={(event) => setSchoolQuery(event.target.value)} placeholder="Search school name or code"/><select aria-label="Plan to assign" value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value)}><option value="">Choose a plan…</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {money(plan.price)}/mo</option>)}</select></div><div style={{ display: "grid", gap: 5, maxHeight: 420, overflow: "auto" }}>{visibleSchools.map((school) => <div key={school.id} className="app-list-row"><div style={{ minWidth: 0, flex: 1 }}><b>{school.name}</b><span>{school.uniqueCode} · {school.subscriptionPlan?.name || "No plan assigned"}</span></div><button type="button" className="app-pill" disabled={!selectedPlan || busy || school.subscriptionPlan?.id === selectedPlan} onClick={() => void assignPlan(school.id, selectedPlan)}>{school.subscriptionPlan?.id === selectedPlan ? "Assigned" : "Assign"}</button></div>)}{visibleSchools.length === 0 ? <div style={{ padding: 28, textAlign: "center", color: "var(--sn-muted)" }}>No schools match this search.</div> : null}</div><div style={{ marginTop: 12, padding: 11, borderRadius: 11, background: "var(--sn-surface-2)", color: "var(--sn-muted)", fontSize: 10, lineHeight: 1.5 }}>Modern subscription operations separate pricing, packaging, entitlement state and billing history, which makes plan changes easier to reason about and audit. citeturn210887search0turn210887search2</div><Link href="/platform/billing" className="app-action" style={{ marginTop: 10 }}><strong>Open billing</strong><ArrowRight size={14}/></Link></section>
      </div>
    </div>
  );
}
