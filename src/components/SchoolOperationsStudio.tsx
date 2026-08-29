"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import "./school-operations.css";

type Module = "library" | "transport" | "feeding" | "inventory" | "recruitment";
type Row = Record<string, any>;

type Props = {
  module: Module;
  schoolName: string;
  userName: string;
  schoolId: string;
};

const META: Record<Module, { title: string; eyebrow: string; subtitle: string; action: string; tabs: string[] }> = {
  library: {
    title: "Learning Library",
    eyebrow: "DISCOVER · READ · SHARE",
    subtitle: "A modern school catalogue for books, eBooks, worksheets, audio, video and learning documents.",
    action: "Add learning material",
    tabs: ["Discover", "Collections", "Borrowing", "Overdue"],
  },
  transport: {
    title: "Transport Command Centre",
    eyebrow: "SAFE JOURNEYS · LIVE OPERATIONS",
    subtitle: "Keep routes, fleet, boarding, live signals and compliance together in one operational view.",
    action: "Add vehicle",
    tabs: ["Today", "Routes", "Fleet", "Boarding", "Compliance"],
  },
  feeding: {
    title: "Feeding & Catering",
    eyebrow: "MENU · SERVICE · COST CONTROL",
    subtitle: "Plan menus, track budgets, record service and compare planned versus actual food cost.",
    action: "Create menu",
    tabs: ["Today", "Menus", "Budgets", "Service", "History"],
  },
  inventory: {
    title: "Assets & Inventory",
    eyebrow: "ACCOUNTABILITY · LIFECYCLE",
    subtitle: "Track what the school owns, where it is, who holds it, condition, cost and maintenance needs.",
    action: "Add asset",
    tabs: ["Overview", "Assets", "Assigned", "Maintenance", "Retired"],
  },
  recruitment: {
    title: "Talent & Recruitment",
    eyebrow: "VACANCIES · APPLICANTS · HIRING",
    subtitle: "Publish professional vacancies, share application links and move candidates through a structured pipeline.",
    action: "Create vacancy",
    tabs: ["Open roles", "Applicants", "Screening", "Interview", "Closed"],
  },
};

const money = (value: any) => `GHS ${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const text = (value: any, fallback = "—") => typeof value === "string" && value.trim() ? value : fallback;
const prettyDate = (value: any) => value ? new Date(String(value)).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function SchoolOperationsStudio({ module, schoolName, userName, schoolId }: Props) {
  const meta = META[module];
  const [data, setData] = useState<Row | null>(null);
  const [activeTab, setActiveTab] = useState(meta.tabs[0]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<Array<{ id: string; label: string }>>([]);
  const [questionText, setQuestionText] = useState("");

  const setField = (name: string, value: string) => setForm((current) => ({ ...current, [name]: value }));

  const endpoint = module === "library"
    ? "/api/school/operations/library"
    : module === "recruitment"
      ? "/api/school/operations/recruitment"
      : `/api/phase3/${module}`;

  async function load() {
    setMessage("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(text(json?.error, text(json?.message, "The workspace could not be loaded.")));
      setData(json && typeof json === "object" ? json : {});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The workspace could not be loaded.");
    }
  }

  useEffect(() => {
    setActiveTab(META[module].tabs[0]);
    setQuery("");
    void load();
    // The endpoint is derived from module and intentionally refreshed only when module changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  async function mutate(payload: Record<string, any>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(text(json?.error, text(json?.message, "The action was not completed.")));
      setMessage("Saved successfully.");
      setForm({});
      setQuestions([]);
      setQuestionText("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The action was not completed.");
    } finally {
      setBusy(false);
    }
  }

  const records = useMemo<Row[]>(() => {
    let source: any[] = [];
    if (module === "library") source = Array.isArray(data?.books) ? data.books : [];
    if (module === "transport") source = Array.isArray(data?.vehicles) ? data.vehicles : [];
    if (module === "feeding") source = Array.isArray(data?.menus) ? data.menus : [];
    if (module === "inventory") source = Array.isArray(data?.assets) ? data.assets : [];
    if (module === "recruitment") source = Array.isArray(data?.postings) ? data.postings : [];
    const q = query.trim().toLowerCase();
    return source.filter((record) => !q || JSON.stringify(record).toLowerCase().includes(q));
  }, [data, module, query]);

  const metrics = useMemo<Array<[string, string, string]>>(() => {
    if (!data) return [];
    if (module === "library") {
      const books = Array.isArray(data.books) ? data.books : [];
      const digital = books.filter((book: Row) => Boolean(book.fileUrl)).length;
      const available = books.reduce((sum: number, book: Row) => sum + Number(book.availableCopies || 0), 0);
      const overdue = Array.isArray(data.loans) ? data.loans.filter((loan: Row) => text(loan.status, text(loan.displayStatus)) === "overdue").length : 0;
      return [["Titles", String(books.length), "Catalogue"], ["Digital", String(digital), "Read / download"], ["Available", String(available), "Ready to borrow"], ["Overdue", String(overdue), "Needs follow-up"]];
    }
    if (module === "transport") {
      const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
      const routes = Array.isArray(data.routes) ? data.routes : [];
      const locations = Array.isArray(data.locations) ? data.locations : [];
      const reminders = Array.isArray(data.reminders) ? data.reminders : [];
      return [["Vehicles", String(vehicles.length), "Fleet"], ["Routes", String(routes.length), "Network"], ["Live signals", String(locations.length), "Latest positions"], ["Compliance", String(reminders.length), "Checks"]];
    }
    if (module === "feeding") {
      const menus = Array.isArray(data.menus) ? data.menus : [];
      const budgets = Array.isArray(data.budgets) ? data.budgets : [];
      const comparison = data.actualVsPlan && typeof data.actualVsPlan === "object" ? data.actualVsPlan : {};
      return [["Menus", String(menus.length), "Planned / published"], ["Budgets", String(budgets.length), "Planning periods"], ["Planned", money(comparison.planned), "Food plan"], ["Actual", money(comparison.actual), `${Number(comparison.utilizationPercent || 0).toFixed(1)}% used`]];
    }
    if (module === "inventory") {
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const assigned = assets.filter((asset: Row) => Boolean(asset.assignedToUserId)).length;
      const maintenance = assets.filter((asset: Row) => text(asset.status, "").toLowerCase().includes("maint")).length;
      const value = assets.reduce((sum: number, asset: Row) => sum + Number(asset.purchaseCost || 0), 0);
      return [["Assets", String(assets.length), "Register"], ["Assigned", String(assigned), "Custody"], ["Maintenance", String(maintenance), "Attention"], ["Recorded cost", money(value), "Purchase value"]];
    }
    const postings = Array.isArray(data.postings) ? data.postings : [];
    const applicants = Array.isArray(data.applicants) ? data.applicants : [];
    const open = postings.filter((posting: Row) => text(posting.status, "open") === "open").length;
    const fresh = applicants.filter((applicant: Row) => text(applicant.status, "new") === "new").length;
    return [["Open roles", String(open), "Published"], ["Applicants", String(applicants.length), "All vacancies"], ["New", String(fresh), "Needs review"], ["Public links", String(postings.filter((posting: Row) => Boolean(posting.publicToken)).length), "Shareable"]];
  }, [data, module]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (module === "library") {
      await mutate({
        action: "createBook",
        ...form,
        copies: Number(form.copies || 1),
        publishedYear: form.publishedYear ? Number(form.publishedYear) : undefined,
        tags: form.tags ? form.tags.split(",").map((item) => item.trim()).filter(Boolean) : [],
      });
      return;
    }
    if (module === "transport") {
      if (form.objectType === "route") {
        await mutate({ action: "createRoute", name: form.name, code: form.code, origin: form.origin, destination: form.destination, status: "active" });
      } else {
        await mutate({ action: "createVehicle", name: form.name, registrationNumber: form.registrationNumber, capacity: Number(form.capacity || 0), driverName: form.driverName, driverPhone: form.driverPhone, status: "active" });
      }
      return;
    }
    if (module === "feeding") {
      if (form.objectType === "budget") {
        await mutate({ action: "createBudget", name: form.name, periodStart: form.periodStart, periodEnd: form.periodEnd, plannedAmount: Number(form.plannedAmount || 0), status: "open" });
      } else if (form.objectType === "service") {
        await mutate({ action: "logMeal", logDate: form.logDate, meal: form.meal, servedCount: Number(form.servedCount || 0), actualCost: Number(form.actualCost || 0), notes: form.notes });
      } else {
        await mutate({ action: "createMenu", menuDate: form.menuDate, meal: form.meal, items: form.items ? form.items.split(",").map((item) => ({ name: item.trim(), allergens: [] })) : [], plannedCost: Number(form.plannedCost || 0) });
      }
      return;
    }
    if (module === "inventory") {
      await mutate({ action: "create", assetTag: form.assetTag, name: form.name, category: form.category, serialNumber: form.serialNumber, location: form.location, condition: form.condition || "good", status: "active", purchaseDate: form.purchaseDate, purchaseCost: Number(form.purchaseCost || 0), notes: form.notes });
      return;
    }
    await mutate({ action: "createPosting", title: form.title, department: form.department, employmentType: form.employmentType, description: form.description, closingDate: form.closingDate, instructions: form.instructions, screeningQuestions: questions.map((question) => ({ ...question, type: "longText", required: true })) });
  };

  return (
    <div className="ops-studio">
      <section className="ops-hero">
        <div className="ops-hero-copy">
          <span className="ops-eyebrow">{meta.eyebrow}</span>
          <h1>{meta.title}</h1>
          <p>{meta.subtitle}</p>
          <div className="ops-hero-tags"><span>{schoolName}</span><span>{userName}</span><span>Live school workspace</span></div>
        </div>
        <div className="ops-hero-art" aria-hidden="true">
          <div className="ops-orb ops-orb-a" />
          <div className="ops-orb ops-orb-b" />
          <div className="ops-art-card"><strong>{module === "library" ? "Read more." : module === "transport" ? "Every journey visible." : module === "feeding" ? "Plan. Serve. Account." : module === "inventory" ? "Nothing gets lost." : "Hire with confidence."}</strong><span>Designed for school operations</span></div>
        </div>
      </section>

      <nav className="ops-tabs" aria-label={`${meta.title} sections`}>
        {meta.tabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
      </nav>

      <section className="ops-kpis">
        {metrics.map(([label, value, hint]) => <div className="ops-kpi" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}
      </section>

      <section className="ops-main-grid">
        <div className="ops-workspace">
          <div className="ops-toolbar">
            <div><strong>{activeTab}</strong><span>{records.length} records in view</span></div>
            <div className="ops-toolbar-actions">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${meta.title.toLowerCase()}…`} aria-label={`Search ${meta.title}`} />
              <button type="button" className="ops-primary" onClick={() => document.getElementById("ops-create")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{meta.action}</button>
            </div>
          </div>

          {message && <div className="ops-message" role="status">{message}</div>}

          {module === "library" && <LibraryView rows={records} />}
          {module === "transport" && <TransportView rows={records} data={data} />}
          {module === "feeding" && <FeedingView rows={records} data={data} />}
          {module === "inventory" && <InventoryView rows={records} />}
          {module === "recruitment" && <RecruitmentView rows={records} data={data} schoolId={schoolId} onMutate={mutate} />}
        </div>

        <aside className="ops-create-card" id="ops-create">
          <div className="ops-create-head"><span>WORKFLOW</span><h2>{meta.action}</h2><p>Structured records keep portals, reports and approvals useful.</p></div>
          <form onSubmit={submit} className="ops-form">
            {module === "library" && <LibraryForm form={form} setField={setField} />}
            {module === "transport" && <TransportForm form={form} setField={setField} />}
            {module === "feeding" && <FeedingForm form={form} setField={setField} />}
            {module === "inventory" && <InventoryForm form={form} setField={setField} />}
            {module === "recruitment" && <>
              <Field label="Job title"><input required value={form.title || ""} onChange={(e) => setField("title", e.target.value)} placeholder="Mathematics Teacher" /></Field>
              <Field label="Department"><input value={form.department || ""} onChange={(e) => setField("department", e.target.value)} placeholder="Academics" /></Field>
              <Field label="Employment type"><select value={form.employmentType || "Full-time"} onChange={(e) => setField("employmentType", e.target.value)}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Temporary</option></select></Field>
              <Field label="Closing date"><input type="date" value={form.closingDate || ""} onChange={(e) => setField("closingDate", e.target.value)} /></Field>
              <Field label="Role description"><textarea required rows={4} value={form.description || ""} onChange={(e) => setField("description", e.target.value)} /></Field>
              <Field label="Applicant instructions"><textarea rows={3} value={form.instructions || ""} onChange={(e) => setField("instructions", e.target.value)} placeholder="Required documents, experience, availability…" /></Field>
              <div className="ops-question-builder">
                <span>Screening questions</span>
                {questions.map((question) => <div className="ops-question" key={question.id}><span>{question.label}</span><button type="button" onClick={() => setQuestions((items) => items.filter((item) => item.id !== question.id))} aria-label={`Remove ${question.label}`}>×</button></div>)}
                <div className="ops-question-add"><input value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="e.g. Do you hold a teaching qualification?" /><button type="button" onClick={() => { const label = questionText.trim(); if (!label) return; setQuestions((items) => [...items, { id: crypto.randomUUID(), label }]); setQuestionText(""); }}>Add</button></div>
              </div>
            </>}
            <button className="ops-submit" disabled={busy}>{busy ? "Saving…" : meta.action}</button>
          </form>
        </aside>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="ops-field"><span>{label}</span>{children}</label>;
}

function LibraryForm({ form, setField }: { form: Record<string, string>; setField: (n: string, v: string) => void }) {
  return <>
    <Field label="Material type"><select value={form.materialType || "book"} onChange={(e) => setField("materialType", e.target.value)}><option value="book">Book</option><option value="ebook">eBook / PDF</option><option value="worksheet">Worksheet</option><option value="audiobook">Audiobook</option><option value="video">Video / lesson</option><option value="document">Document</option><option value="other">Other resource</option></select></Field>
    <Field label="Title"><input required value={form.title || ""} onChange={(e) => setField("title", e.target.value)} /></Field>
    <Field label="Author / creator"><input value={form.author || ""} onChange={(e) => setField("author", e.target.value)} /></Field>
    <Field label="Category"><input required value={form.category || ""} onChange={(e) => setField("category", e.target.value)} placeholder="Mathematics, Reading…" /></Field>
    <Field label="Copies"><input type="number" min="1" value={form.copies || "1"} onChange={(e) => setField("copies", e.target.value)} /></Field>
    <Field label="Cover image URL"><input value={form.coverUrl || ""} onChange={(e) => setField("coverUrl", e.target.value)} /></Field>
    <Field label="Learning file URL"><input value={form.fileUrl || ""} onChange={(e) => setField("fileUrl", e.target.value)} placeholder="PDF, audio, video or document URL" /></Field>
    <Field label="Description"><textarea rows={3} value={form.description || ""} onChange={(e) => setField("description", e.target.value)} /></Field>
    <Field label="Tags"><input value={form.tags || ""} onChange={(e) => setField("tags", e.target.value)} placeholder="Form 2, algebra, revision" /></Field>
  </>;
}

function TransportForm({ form, setField }: { form: Record<string, string>; setField: (n: string, v: string) => void }) {
  return <>
    <Field label="Create"><select value={form.objectType || "vehicle"} onChange={(e) => setField("objectType", e.target.value)}><option value="vehicle">Vehicle</option><option value="route">Route</option></select></Field>
    <Field label="Name"><input required value={form.name || ""} onChange={(e) => setField("name", e.target.value)} /></Field>
    {form.objectType === "route" ? <><Field label="Route code"><input value={form.code || ""} onChange={(e) => setField("code", e.target.value)} /></Field><Field label="Origin"><input value={form.origin || ""} onChange={(e) => setField("origin", e.target.value)} /></Field><Field label="Destination"><input value={form.destination || ""} onChange={(e) => setField("destination", e.target.value)} /></Field></> : <><Field label="Registration"><input required value={form.registrationNumber || ""} onChange={(e) => setField("registrationNumber", e.target.value)} /></Field><Field label="Capacity"><input type="number" min="1" value={form.capacity || ""} onChange={(e) => setField("capacity", e.target.value)} /></Field><Field label="Driver"><input value={form.driverName || ""} onChange={(e) => setField("driverName", e.target.value)} /></Field><Field label="Driver phone"><input value={form.driverPhone || ""} onChange={(e) => setField("driverPhone", e.target.value)} /></Field></>}
  </>;
}

function FeedingForm({ form, setField }: { form: Record<string, string>; setField: (n: string, v: string) => void }) {
  return <>
    <Field label="Create"><select value={form.objectType || "menu"} onChange={(e) => setField("objectType", e.target.value)}><option value="menu">Meal menu</option><option value="budget">Budget</option><option value="service">Service log</option></select></Field>
    {form.objectType === "budget" ? <><Field label="Budget name"><input required value={form.name || ""} onChange={(e) => setField("name", e.target.value)} /></Field><Field label="Start"><input type="date" required value={form.periodStart || ""} onChange={(e) => setField("periodStart", e.target.value)} /></Field><Field label="End"><input type="date" required value={form.periodEnd || ""} onChange={(e) => setField("periodEnd", e.target.value)} /></Field><Field label="Planned amount"><input type="number" step="0.01" value={form.plannedAmount || ""} onChange={(e) => setField("plannedAmount", e.target.value)} /></Field></> : form.objectType === "service" ? <><Field label="Date"><input type="date" required value={form.logDate || ""} onChange={(e) => setField("logDate", e.target.value)} /></Field><Field label="Meal"><input required value={form.meal || ""} onChange={(e) => setField("meal", e.target.value)} placeholder="Breakfast / lunch" /></Field><Field label="Served count"><input type="number" min="0" value={form.servedCount || ""} onChange={(e) => setField("servedCount", e.target.value)} /></Field><Field label="Actual cost"><input type="number" step="0.01" value={form.actualCost || ""} onChange={(e) => setField("actualCost", e.target.value)} /></Field><Field label="Notes"><textarea rows={2} value={form.notes || ""} onChange={(e) => setField("notes", e.target.value)} /></Field></> : <><Field label="Menu date"><input type="date" required value={form.menuDate || ""} onChange={(e) => setField("menuDate", e.target.value)} /></Field><Field label="Meal"><input required value={form.meal || ""} onChange={(e) => setField("meal", e.target.value)} /></Field><Field label="Items"><textarea rows={3} value={form.items || ""} onChange={(e) => setField("items", e.target.value)} placeholder="Rice, stew, fruit, water…" /></Field><Field label="Planned cost"><input type="number" step="0.01" value={form.plannedCost || ""} onChange={(e) => setField("plannedCost", e.target.value)} /></Field></>}
  </>;
}

function InventoryForm({ form, setField }: { form: Record<string, string>; setField: (n: string, v: string) => void }) {
  return <><Field label="Asset tag"><input required value={form.assetTag || ""} onChange={(e) => setField("assetTag", e.target.value)} placeholder="AST-0001" /></Field><Field label="Asset name"><input required value={form.name || ""} onChange={(e) => setField("name", e.target.value)} /></Field><Field label="Category"><input required value={form.category || ""} onChange={(e) => setField("category", e.target.value)} placeholder="ICT, furniture, laboratory…" /></Field><Field label="Serial number"><input value={form.serialNumber || ""} onChange={(e) => setField("serialNumber", e.target.value)} /></Field><Field label="Location"><input value={form.location || ""} onChange={(e) => setField("location", e.target.value)} placeholder="Library / Lab 2" /></Field><Field label="Condition"><select value={form.condition || "good"} onChange={(e) => setField("condition", e.target.value)}><option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></Field><Field label="Purchase cost"><input type="number" step="0.01" value={form.purchaseCost || ""} onChange={(e) => setField("purchaseCost", e.target.value)} /></Field><Field label="Notes"><textarea rows={3} value={form.notes || ""} onChange={(e) => setField("notes", e.target.value)} /></Field></>;
}

function LibraryView({ rows }: { rows: Row[] }) {
  return <div className="library-grid">{rows.map((book) => { const url = text(book.fileUrl, ""); const digital = Boolean(url); return <article className="book-card" key={String(book.id)}><div className="book-cover">{book.coverUrl ? <img src={String(book.coverUrl)} alt="" /> : <div><small>{text(book.materialType, "book").toUpperCase()}</small><strong>{text(book.title, "BK").slice(0, 2).toUpperCase()}</strong></div>}</div><div className="book-body"><span className="book-category">{text(book.category)}</span><h3>{text(book.title)}</h3><p>{text(book.author, "School resource")}</p><div className="book-meta"><span>{Number(book.availableCopies || 0)} available</span><span>{digital ? "Digital" : `${Number(book.copies || 0)} copies`}</span></div>{digital && <div className="book-actions"><a className="ops-link" href={url} target="_blank" rel="noreferrer">Read</a><a className="ops-link secondary" href={url} download>Download</a></div>}</div></article>; })}{rows.length === 0 && <Empty text="No learning materials match this search." />}</div>;
}

function TransportView({ rows, data }: { rows: Row[]; data: Row | null }) {
  const routes = Array.isArray(data?.routes) ? data.routes : [];
  const locations = Array.isArray(data?.locations) ? data.locations : [];
  return <div className="ops-transport"><div className="route-board"><div className="route-board-head"><div><span>LIVE ROUTE BOARD</span><h3>Today's journeys</h3></div><strong>{locations.length} live signals</strong></div>{routes.slice(0, 8).map((route: Row) => <div className="route-row" key={String(route.id)}><div className="route-dot" /><div><strong>{text(route.name)}</strong><span>{text(route.origin)} → {text(route.destination)}</span></div><div className="route-status">{locations.some((location: Row) => String(location.routeId || "") === String(route.id || "")) ? "LIVE" : "READY"}</div></div>)}{routes.length === 0 && <Empty text="Create routes to see the daily journey board." />}</div><div className="fleet-strip">{rows.map((vehicle) => <div className="fleet-card" key={String(vehicle.id)}><span>VEHICLE</span><strong>{text(vehicle.name, text(vehicle.registrationNumber))}</strong><p>{text(vehicle.registrationNumber)} · {Number(vehicle.capacity || 0)} seats</p><small>{text(vehicle.driverName, "Driver not assigned")}</small></div>)}</div></div>;
}

function FeedingView({ rows, data }: { rows: Row[]; data: Row | null }) {
  const first = rows[0];
  const comparison = data?.actualVsPlan && typeof data.actualVsPlan === "object" ? data.actualVsPlan : {};
  const itemText = first && Array.isArray(first.items) ? first.items.map((item: any) => typeof item === "object" && item !== null ? text(item.name) : String(item)).join(" · ") : "Create a menu with ingredients, allergens and planned cost.";
  return <div className="feeding-board"><div className="menu-feature"><span>MENU PREVIEW</span><h3>{text(first?.meal, "Today")}</h3><p>{itemText}</p><div className="food-bottom"><strong>{money(first?.plannedCost)}</strong><span>planned cost</span></div></div><div className="feeding-side"><div className="service-stat"><span>ACTUAL VS PLAN</span><strong>{money(comparison.actual)}</strong><small>{Number(comparison.utilizationPercent || 0).toFixed(1)}% used</small></div><div className="service-stat"><span>MENU DAYS</span><strong>{String(rows.length)}</strong><small>recent menu records</small></div></div></div>;
}

function InventoryView({ rows }: { rows: Row[] }) {
  return <div className="inventory-table"><table><thead><tr><th>Asset</th><th>Tag</th><th>Location</th><th>Condition</th><th>Status</th><th>Purchase</th></tr></thead><tbody>{rows.map((asset) => <tr key={String(asset.id)}><td><strong>{text(asset.name)}</strong><small>{text(asset.category)}</small></td><td><span className="tag-chip">{text(asset.assetTag)}</span></td><td>{text(asset.location)}</td><td>{text(asset.condition)}</td><td>{text(asset.status)}</td><td>{money(asset.purchaseCost)}</td></tr>)}{rows.length === 0 && <tr><td colSpan={6}><Empty text="No assets yet. Start with the asset register." /></td></tr>}</tbody></table></div>;
}

function RecruitmentView({ rows, data, schoolId, onMutate }: { rows: Row[]; data: Row | null; schoolId: string; onMutate: (payload: Record<string, any>) => Promise<void> }) {
  const applicants = Array.isArray(data?.applicants) ? data.applicants : [];
  const stages = ["new", "screening", "interview", "offer"];
  const makeLink = (posting: Row) => posting.publicToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/jobs/${schoolId}/${String(posting.publicToken)}` : "";
  return <div className="recruitment-board"><div className="vacancy-list">{rows.map((posting) => { const status = text(posting.status, "open"); const link = makeLink(posting); return <article className="vacancy-card" key={String(posting.id)}><div><span>{text(posting.department, "School")}</span><h3>{text(posting.title)}</h3><p>{text(posting.employmentType)} · {posting.closingDate ? `Closes ${prettyDate(posting.closingDate)}` : "Open until closed"}</p></div><div className="vacancy-actions"><span className={`status-chip ${status}`}>{status}</span><button type="button" onClick={() => void onMutate({ action: "setStatus", postingId: String(posting.id), status: status === "open" ? "paused" : "open" })}>{status === "open" ? "Pause" : "Open"}</button>{link && <button type="button" onClick={() => void navigator.clipboard.writeText(link)}>Copy application link</button>}</div></article>; })}{rows.length === 0 && <Empty text="Create a vacancy and publish a professional application page." />}</div><div className="applicant-pipeline"><div className="pipeline-head"><div><span>CANDIDATE PIPELINE</span><h3>{String(applicants.length)} applicants</h3></div><small>New → screening → interview → offer</small></div><div className="pipeline-columns">{stages.map((stage) => { const stageRows = applicants.filter((applicant: Row) => text(applicant.status, "new") === stage); return <div className="pipeline-col" key={stage}><span>{stage}</span><strong>{String(stageRows.length)}</strong>{stageRows.slice(0, 4).map((applicant: Row) => <div className="candidate-mini" key={String(applicant.id)}><strong>{text(applicant.name)}</strong><small>{text(applicant.email, text(applicant.phone))}</small></div>)}</div>; })}</div></div></div>;
}

function Empty({ text: message }: { text: string }) {
  return <div className="ops-empty"><strong>{message}</strong><span>Use the workflow panel to get this workspace moving.</span></div>;
}
