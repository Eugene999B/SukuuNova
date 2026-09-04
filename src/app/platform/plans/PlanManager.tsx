"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleHelp, Layers3, Plus, RefreshCw, Search, Sparkles, UsersRound, X } from "lucide-react";
import PlatformWorkflowDialog from "@/components/PlatformWorkflowDialog";

type Plan = { id: string; name: string; price: string | number; featureFlags: unknown };
type School = { id: string; name: string; uniqueCode: string; status: string; subscriptionPlan?: { id: string; name: string; price: string | number; featureFlags?: unknown } | null };

const FEATURE_GROUPS = [
  { label: "Core operations", description: "The everyday capabilities most schools depend on.", items: [{ key: "attendance", label: "Attendance" }, { key: "finance", label: "Finance" }, { key: "report_cards", label: "Report cards" }] },
  { label: "School life", description: "Optional capabilities that expand the school workspace.", items: [{ key: "transport", label: "Transport" }, { key: "feeding", label: "Feeding" }, { key: "library", label: "Library" }] },
  { label: "Advanced", description: "Higher-complexity tools for mature school operations.", items: [{ key: "exams", label: "Exams & assessments" }, { key: "payroll", label: "Payroll" }, { key: "analytics", label: "Analytics" }] },
];
const ALL_FEATURES = FEATURE_GROUPS.flatMap((group) => group.items);
function flagsOf(plan: Plan | School["subscriptionPlan"] | null | undefined): string[] { return Array.isArray(plan?.featureFlags) ? plan.featureFlags.filter((value): value is string => typeof value === "string") : []; }
function money(value: number | string) { const amount = Number(value); return Number.isFinite(amount) ? `₵${amount.toLocaleString()}` : "₵0"; }

export default function PlanManager() {
  const [plans, setPlans] = useState<Plan[]>([]), [schools, setSchools] = useState<School[]>([]), [canEditCatalog, setCanEditCatalog] = useState(false);
  const [query, setQuery] = useState(""), [schoolQuery, setSchoolQuery] = useState(""), [selectedPlan, setSelectedPlan] = useState("");
  const [name, setName] = useState(""), [price, setPrice] = useState(""), [flags, setFlags] = useState<string[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"create" | "assign" | null>(null);

  async function load() {
    setBusy(true);
    try {
      const response = await fetch("/api/platform/plans", { cache: "no-store" });
      const data = await response.json() as { plans?: Plan[]; schools?: School[]; canEditCatalog?: boolean; message?: string; error?: string };
      if (!response.ok) { setMessage(data.message ?? data.error ?? "Unable to load plan data."); return; }
      setPlans(Array.isArray(data.plans) ? data.plans : []);
      setSchools(Array.isArray(data.schools) ? data.schools : []);
      setCanEditCatalog(data.canEditCatalog === true);
      setMessage("");
    } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  async function createPlan() {
    const trimmedName = name.trim(), numericPrice = Number(price);
    if (!trimmedName) { setMessage("Give the plan a name first."); return; }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) { setMessage("Enter a valid monthly price."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/platform/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", name: trimmedName, price: numericPrice, featureFlags: flags }) });
      const data = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? `Plan “${trimmedName}” created.` : (data.message ?? data.error ?? "Unable to create plan."));
      if (response.ok) { setName(""); setPrice(""); setFlags([]); setDialog(null); await load(); }
    } finally { setBusy(false); }
  }

  async function assignPlan(schoolId: string, planId: string) {
    if (!planId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/platform/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "assign", schoolId, planId }) });
      const data = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? "Subscription assignment updated and audited." : (data.message ?? data.error ?? "Unable to assign plan."));
      if (response.ok) await load();
    } finally { setBusy(false); }
  }

  const visiblePlans = useMemo(() => { const q = query.trim().toLowerCase(); return plans.filter((plan) => !q || plan.name.toLowerCase().includes(q)); }, [plans, query]);
  const visibleSchools = useMemo(() => { const q = schoolQuery.trim().toLowerCase(); return schools.filter((school) => !q || school.name.toLowerCase().includes(q) || school.uniqueCode.toLowerCase().includes(q)); }, [schools, schoolQuery]);
  const assignedCount = useMemo(() => plans.reduce((count, plan) => count + schools.filter((school) => school.subscriptionPlan?.id === plan.id).length, 0), [plans, schools]);
  const selectedPlanRecord = plans.find((plan) => plan.id === selectedPlan) ?? null;

  return <div className="platform-page-stack">
    {message ? <div className="app-banner" role="status"><div><h3>{message}</h3><p>Plan and entitlement changes are permission-checked and audited.</p></div><span className="app-pill">Controlled</span><button type="button" className="platform-dialog-close" onClick={() => setMessage("")} aria-label="Dismiss message"><X size={16}/></button></div> : null}
    <section className="platform-page-header">
      <div><span className="platform-eyebrow">Commercial packaging</span><h2>Plans & entitlements</h2><p>Define what a school receives, what it pays, and which schools are currently assigned to each package.</p></div>
      <div className="platform-header-actions"><button type="button" className="app-pill" onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button>{canEditCatalog ? <button type="button" className="app-action" onClick={() => setDialog("create")}><Plus size={14}/><strong>Create plan</strong>Build package</button> : <span className="app-pill">Super Admin catalog</span>}</div>
    </section>
    <div className="app-grid kpis platform-kpis">
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Plan catalog</span><span className="app-kpi-icon"><Layers3 size={17}/></span></div><div className="app-kpi-value">{plans.length}</div><div className="app-kpi-meta">Subscription packages</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Assigned schools</span><span className="app-kpi-icon"><Check size={17}/></span></div><div className="app-kpi-value">{assignedCount}</div><div className="app-kpi-meta">Schools with a plan</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Need assignment</span><span className="app-kpi-icon"><CircleHelp size={17}/></span></div><div className="app-kpi-value">{Math.max(0, schools.length - assignedCount)}</div><div className="app-kpi-meta">Schools without a plan</div></div>
      <div className="app-card app-kpi"><div className="app-kpi-top"><span className="app-kpi-label">Available entitlements</span><span className="app-kpi-icon"><Sparkles size={17}/></span></div><div className="app-kpi-value">{ALL_FEATURES.length}</div><div className="app-kpi-meta">Product capabilities</div></div>
    </div>
    <section className="app-card app-panel platform-catalog-card">
      <div className="app-card-head"><div><span className="app-eyebrow">PLAN CATALOG</span><h2>Packages at a glance</h2><p>Price and entitlement scope are visible together. Open a plan to see where it is being used.</p></div></div>
      <div className="platform-filter-search"><Search size={15}/><input aria-label="Search plans" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plan name"/><span>{visiblePlans.length} shown</span></div>
      <div className="platform-plan-list">{visiblePlans.map((plan) => { const planFlags = flagsOf(plan); const adoption = schools.filter((school) => school.subscriptionPlan?.id === plan.id).length; return <div className="platform-plan-row" key={plan.id}><div className="platform-plan-title"><span className="platform-workflow-icon"><Layers3 size={17}/></span><div><b>{plan.name}</b><small>{planFlags.length ? `${planFlags.length} entitlements enabled` : "Core-only package"}</small></div></div><strong>{money(plan.price)}<small>/ month</small></strong><span className="app-pill">{adoption} schools</span><div className="platform-plan-entitlements">{planFlags.slice(0,5).map((flag) => <span className="app-pill" key={flag}>{flag.replaceAll("_", " ")}</span>)}{planFlags.length > 5 ? <span className="app-pill">+{planFlags.length - 5} more</span> : null}</div><button type="button" className="app-pill" onClick={() => { setSelectedPlan(plan.id); setDialog("assign"); }}>Use this plan <ArrowRight size={13}/></button></div>; })}{visiblePlans.length === 0 ? <div className="platform-empty"><strong>No plans match this search.</strong><span>Clear the search or create a new package.</span></div> : null}</div>
    </section>
    <section className="platform-plan-next app-card app-panel">
      <div><span className="platform-eyebrow">NEXT STEP</span><h2>Assign a package to a school</h2><p>Plan creation defines the catalogue. Assignment connects the commercial package to an actual school account.</p></div>
      <button type="button" className="app-action" onClick={() => setDialog("assign")} disabled={!plans.length || !schools.length}><UsersRound size={14}/><strong>Assign a plan</strong>Choose school + package</button>
    </section>
    <PlatformWorkflowDialog open={dialog === "create"} onClose={() => setDialog(null)} eyebrow="PLAN CATALOG" title="Create a plan" description="Build a clear commercial package. You can assign it to schools after it has been created.">
      <div className="platform-dialog-form"><label><span>Plan name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Growth" autoFocus/></label><label><span>Monthly price</span><div className="platform-input-with-suffix"><input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="250" type="number" min="0" step="0.01"/><span>GHS / month</span></div></label><div className="platform-dialog-section"><div><b>What is included?</b><p>Select the product capabilities this plan unlocks.</p></div>{FEATURE_GROUPS.map((group) => <section key={group.label} className="platform-entitlement-group"><div><strong>{group.label}</strong><small>{group.description}</small></div><div className="platform-entitlement-grid">{group.items.map((item) => <label key={item.key} className={flags.includes(item.key) ? "is-checked" : ""}><input type="checkbox" checked={flags.includes(item.key)} onChange={(event) => setFlags((current) => event.target.checked ? [...current, item.key] : current.filter((flag) => flag !== item.key))}/><span>{item.label}</span></label>)}</div></section>)}</div><div className="platform-dialog-actions"><button type="button" className="app-pill" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="app-action" onClick={() => void createPlan()} disabled={busy || !name.trim()}><Plus size={14}/><strong>{busy ? "Creating…" : "Create plan"}</strong></button></div></div>
    </PlatformWorkflowDialog>
    <PlatformWorkflowDialog open={dialog === "assign"} onClose={() => setDialog(null)} eyebrow="ENTITLEMENT ASSIGNMENT" title="Assign a plan" description="Choose the school and commercial package. The assignment is audited and immediately becomes the school’s active subscription plan.">
      <div className="platform-dialog-form"><label><span>Plan</span><select value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value)}><option value="">Choose a plan…</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {money(plan.price)} / month</option>)}</select></label>{selectedPlanRecord ? <div className="platform-dialog-summary"><strong>{selectedPlanRecord.name}</strong><span>{flagsOf(selectedPlanRecord).length} entitlements · {money(selectedPlanRecord.price)} / month</span></div> : null}<label><span>Search school</span><div className="platform-filter-search"><Search size={15}/><input value={schoolQuery} onChange={(event) => setSchoolQuery(event.target.value)} placeholder="School name or unique code"/></div></label><div className="platform-dialog-school-list">{visibleSchools.slice(0,18).map((school) => <div className="platform-dialog-school-row" key={school.id}><div><b>{school.name}</b><small>{school.uniqueCode} · {school.subscriptionPlan?.name || "No plan assigned"}</small></div><button type="button" className="app-pill" disabled={!selectedPlan || busy || school.subscriptionPlan?.id === selectedPlan} onClick={() => void assignPlan(school.id, selectedPlan)}>{school.subscriptionPlan?.id === selectedPlan ? "Assigned" : "Assign"}</button></div>)}{visibleSchools.length === 0 ? <div className="platform-empty"><strong>No schools match.</strong><span>Change the school search.</span></div> : null}</div><div className="platform-dialog-actions"><button type="button" className="app-pill" onClick={() => setDialog(null)}>Done</button><Link href="/platform/billing" className="app-action"><strong>Open billing</strong><ArrowRight size={14}/></Link></div></div>
    </PlatformWorkflowDialog>
  </div>;
}
