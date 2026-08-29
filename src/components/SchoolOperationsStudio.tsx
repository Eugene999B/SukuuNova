"use client";

import { useEffect, useMemo, useState } from "react";
import "./school-operations.css";

type Module = "library" | "transport" | "feeding" | "inventory" | "recruitment";
type AnyRow = Record<string, unknown>;

type Props = { module: Module; schoolName: string; schoolCode?: string; userName: string; schoolId: string };

const money = (v: unknown) => `GHS ${Number(v || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v: unknown) => v ? new Date(String(v)).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const str = (v: unknown, fallback = "—") => typeof v === "string" && v.trim() ? v : fallback;

const copy: Record<Module, { title: string; eyebrow: string; subtitle: string; tabs: string[]; action: string }> = {
  library: { title: "Learning Library", eyebrow: "DISCOVER · READ · SHARE", subtitle: "One beautiful catalogue for books, worksheets, PDFs, audio, video and other school learning resources.", tabs: ["Discover", "Collections", "Borrowing", "Overdue"], action: "Add learning material" },
  transport: { title: "Transport Command Centre", eyebrow: "SAFE JOURNEYS · LIVE OPERATIONS", subtitle: "Routes, vehicles, stops, boarding, parent visibility, compliance and daily trip control in one workspace.", tabs: ["Today", "Routes", "Fleet", "Boarding", "Compliance"], action: "Add vehicle" },
  feeding: { title: "Feeding & Catering", eyebrow: "MENU · SERVICE · COST CONTROL", subtitle: "Plan menus, manage budgets, record service, understand actual cost and publish a clear meal plan.", tabs: ["Today", "Menus", "Budgets", "Service", "History"], action: "Create menu" },
  inventory: { title: "Assets & Inventory", eyebrow: "ACCOUNTABILITY · LIFECYCLE", subtitle: "Know what the school owns, where it is, who holds it, what condition it is in and what needs attention.", tabs: ["Overview", "Assets", "Assigned", "Maintenance", "Retired"], action: "Add asset" },
  recruitment: { title: "Talent & Recruitment", eyebrow: "VACANCIES · APPLICANTS · HIRING", subtitle: "Create a professional vacancy, publish a secure public application link, screen candidates and move the strongest applicants into staff.", tabs: ["Open roles", "Applicants", "Screening", "Interview", "Closed"], action: "Create vacancy" }
};

export default function SchoolOperationsStudio({ module, schoolName, schoolCode, userName, schoolId }: Props) {
  const meta = copy[module];
  const [data, setData] = useState<AnyRow | null>(null);
  const [tab, setTab] = useState(meta.tabs[0]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [questionText, setQuestionText] = useState("");
  const [questions, setQuestions] = useState<Array<{ id: string; label: string; type: string; required: boolean }>>([]);

  async function load() {
    setMessage("");
    const endpoint = module === "library" ? "/api/school/operations/library" : module === "recruitment" ? "/api/school/operations/recruitment" : `/api/phase3/${module}`;
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || json?.message || "The workspace could not be loaded.");
      setData(json);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The workspace could not be loaded."); }
  }

  useEffect(() => { void load(); }, [module]);

  async function mutate(endpoint: string, payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || json?.message || "The action was not completed.");
      setMessage("Saved successfully.");
      setForm({});
      setQuestions([]);
      setQuestionText("");
      await load();
      return json?.result ?? json;
    } catch (error) { setMessage(error instanceof Error ? error.message : "The action was not completed."); return null; }
    finally { setBusy(false); }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const source = module === "library" ? (Array.isArray(data.books) ? data.books : []) : module === "transport" ? (Array.isArray(data.vehicles) ? data.vehicles : []) : module === "feeding" ? (Array.isArray(data.menus) ? data.menus : []) : module === "inventory" ? (Array.isArray(data.assets) ? data.assets : []) : (Array.isArray(data.postings) ? data.postings : []);
    const q = query.trim().toLowerCase();
    return (source as AnyRow[]).filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  }, [data, module, query]);

  const metrics = useMemo(() => {
    if (!data) return [] as Array<[string, string, string]>;
    if (module === "library") {
      const books = Array.isArray(data.books) ? data.books : [];
      const digital = books.filter(b => Boolean(b.fileUrl)).length;
      const available = books.reduce((n, b) => n + Number(b.availableCopies || 0), 0);
      const overdue = Array.isArray(data.loans) ? data.loans.filter(l => str(l.displayStatus, str(l.status)) === "overdue").length : 0;
      return [["Titles", String(books.length), "Catalogue"], ["Digital", String(digital), "Read online / download"], ["Available copies", String(available), "Ready to borrow"], ["Overdue", String(overdue), "Needs follow-up"]];
    }
    if (module === "transport") {
      const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
      const routes = Array.isArray(data.routes) ? data.routes : [];
      const locations = Array.isArray(data.locations) ? data.locations : [];
      const reminders = Array.isArray(data.reminders) ? data.reminders : [];
      return [["Vehicles", String(vehicles.length), "Fleet"], ["Routes", String(routes.length), "Active network"], ["Live signals", String(locations.length), "Latest positions"], ["Compliance", String(reminders.length), "Checks & reminders"]];
    }
    if (module === "feeding") {
      const menus = Array.isArray(data.menus) ? data.menus : [];
      const budgets = Array.isArray(data.budgets) ? data.budgets : [];
      const actualPlan = data.actualVsPlan as AnyRow | undefined;
      return [["Menus", String(menus.length), "Published / planned"], ["Budgets", String(budgets.length), "Planning periods"], ["Planned", money(actualPlan?.planned), "Food plan"], ["Actual", money(actualPlan?.actual), `${Number(actualPlan?.utilizationPercent || 0).toFixed(1)}% of plan`]];
    }
    if (module === "inventory") {
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const assigned = assets.filter(a => Boolean(a.assignedToUserId)).length;
      const maintenance = assets.filter(a => str(a.status, "").toLowerCase().includes("maint")).length;
      const value = assets.reduce((n, a) => n + Number(a.purchaseCost || 0), 0);
      return [["Assets", String(assets.length), "Asset register"], ["Assigned", String(assigned), "Custody"], ["Maintenance", String(maintenance), "Attention"], ["Book value input", money(value), "Recorded purchase cost"]];
    }
    const posts = Array.isArray(data.postings) ? data.postings : [];
    const applicants = Array.isArray(data.applicants) ? data.applicants : [];
    const open = posts.filter(p => p.status === "open").length;
    const newApplicants = applicants.filter(a => a.status === "new").length;
    return [["Open roles", String(open), "Published"], ["Applicants", String(applicants.length), "All vacancies"], ["New", String(newApplicants), "Needs review"], ["Links", String(posts.filter(p => Boolean(p.publicToken)).length), "Public application"]];
  }, [data, module]);

  const publicLink = (posting: AnyRow) => {
    const token = str(posting.publicToken, "");
    return token ? `${typeof window !== "undefined" ? window.location.origin : ""}/jobs/${schoolId}/${token}` : "";
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (module === "library") return void mutate("/api/school/operations/library", { action: "createBook", ...form, copies: Number(form.copies || 1), publishedYear: form.publishedYear ? Number(form.publishedYear) : undefined, tags: form.tags ? form.tags.split(",").map(s => s.trim()).filter(Boolean) : [], accessibility: { audio: form.accessAudio === "on", textToSpeech: form.accessTts === "on", captions: form.accessCaptions === "on" } });
    if (module === "transport") return void mutate("/api/phase3/transport", { action: form.objectType === "route" ? "createRoute" : "createVehicle", ...(form.objectType === "route" ? { name: form.name, code: form.code, origin: form.origin, destination: form.destination, status: "active" } : { registrationNumber: form.registrationNumber, name: form.name, capacity: Number(form.capacity || 0), driverName: form.driverName, driverPhone: form.driverPhone, status: "active" }) });
    if (module === "feeding") return void mutate("/api/phase3/feeding", { action: form.objectType === "budget" ? "createBudget" : form.objectType === "service" ? "logMeal" : "createMenu", ...(form.objectType === "budget" ? { name: form.name, periodStart: form.periodStart, periodEnd: form.periodEnd, plannedAmount: Number(form.plannedAmount || 0), status: "open" } : form.objectType === "service" ? { logDate: form.logDate, meal: form.meal, servedCount: Number(form.servedCount || 0), actualCost: Number(form.actualCost || 0), notes: form.notes } : { menuDate: form.menuDate, meal: form.meal, items: form.items ? form.items.split(",").map(s => ({ name: s.trim(), allergens: [] })) : [], plannedCost: Number(form.plannedCost || 0) }) });
    if (module === "inventory") return void mutate("/api/phase3/assets", { action: "create", assetTag: form.assetTag, name: form.name, category: form.category, serialNumber: form.serialNumber, location: form.location, condition: form.condition || "good", status: "active", purchaseDate: form.purchaseDate, purchaseCost: Number(form.purchaseCost || 0), notes: form.notes });
    return void mutate("/api/school/operations/recruitment", { action: "createPosting", title: form.title, department: form.department, employmentType: form.employmentType, description: form.description, closingDate: form.closingDate, instructions: form.instructions, screeningQuestions: questions });
  };

  return <div className="ops-studio">
    <section className="ops-hero">
      <div className="ops-hero-copy"><span className="ops-eyebrow">{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.subtitle}</p><div className="ops-hero-tags"><span>{schoolName}</span><span>{userName}</span><span>Live school workspace</span></div></div>
      <div className="ops-hero-art" aria-hidden="true"><div className="ops-orb ops-orb-a" /><div className="ops-orb ops-orb-b" /><div className="ops-art-card"><strong>{module === "library" ? "Read more." : module === "transport" ? "Every journey visible." : module === "feeding" ? "Plan. Serve. Account." : module === "inventory" ? "Nothing gets lost." : "Hire with confidence."}</strong><span>Designed for school operations</span></div></div>
    </section>
    <nav className="ops-tabs">{meta.tabs.map(item => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
    <section className="ops-kpis">{metrics.map(([label, value, hint]) => <div className="ops-kpi" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}</section>
    <section className="ops-main-grid">
      <div className="ops-workspace">
        <div className="ops-toolbar"><div><strong>{tab}</strong><span>{rows.length} records in view</span></div><div className="ops-toolbar-actions"><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${meta.title.toLowerCase()}…`} /><button className="ops-primary" onClick={() => setMessage("Use the creation panel below to add a record.")}>{meta.action}</button></div></div>
        {message && <div className="ops-message">{message}</div>}
        {module === "library" ? <LibraryView rows={rows} /> : module === "transport" ? <TransportView data={data} rows={rows} /> : module === "feeding" ? <FeedingView data={data} rows={rows} /> : module === "inventory" ? <InventoryView rows={rows} /> : <RecruitmentView rows={rows} data={data} schoolId={schoolId} publicLink={publicLink} mutate={mutate} />}
      </div>
      <aside className="ops-create-card">
        <div className="ops-create-head"><span>WORKFLOW</span><h2>{meta.action}</h2><p>Use structured fields so future reports, portals and approvals have clean data.</p></div>
        <form onSubmit={submitForm} className="ops-form">
          {module === "library" && <><Field label="Material type"><select value={form.materialType || "book"} onChange={e => setForm({...form, materialType:e.target.value})}><option value="book">Book</option><option value="ebook">eBook / PDF</option><option value="worksheet">Worksheet</option><option value="audiobook">Audiobook</option><option value="video">Video / lesson</option><option value="document">Document</option><option value="other">Other resource</option></select></Field><Field label="Title"><input required value={form.title || ""} onChange={e=>setForm({...form,title:e.target.value})}/></Field><Field label="Author / creator"><input value={form.author || ""} onChange={e=>setForm({...form,author:e.target.value})}/></Field><Field label="Category"><input required value={form.category || ""} placeholder="Mathematics, Reading…" onChange={e=>setForm({...form,category:e.target.value})}/></Field><Field label="ISBN / reference"><input value={form.isbn || ""} onChange={e=>setForm({...form,isbn:e.target.value})}/></Field><Field label="Copies"><input type="number" min="1" value={form.copies || "1"} onChange={e=>setForm({...form,copies:e.target.value})}/></Field><Field label="Cover image URL"><input value={form.coverUrl || ""} placeholder="Optional" onChange={e=>setForm({...form,coverUrl:e.target.value})}/></Field><Field label="File / reading URL"><input value={form.fileUrl || ""} placeholder="PDF, audio, video or document URL" onChange={e=>setForm({...form,fileUrl:e.target.value})}/></Field><Field label="Description"><textarea value={form.description || ""} rows={3} onChange={e=>setForm({...form,description:e.target.value})}/></Field><Field label="Tags"><input value={form.tags || ""} placeholder="Form 2, algebra, revision" onChange={e=>setForm({...form,tags:e.target.value})}/></Field></>}
          {module === "transport" && <><Field label="Create"><select value={form.objectType || "vehicle"} onChange={e=>setForm({...form,objectType:e.target.value})}><option value="vehicle">Vehicle</option><option value="route">Route</option></select></Field><Field label="Name"><input required value={form.name || ""} onChange={e=>setForm({...form,name:e.target.value})}/></Field>{form.objectType !== "route" ? <><Field label="Registration"><input required value={form.registrationNumber || ""} onChange={e=>setForm({...form,registrationNumber:e.target.value})}/></Field><Field label="Capacity"><input type="number" min="1" value={form.capacity || ""} onChange={e=>setForm({...form,capacity:e.target.value})}/></Field><Field label="Driver"><input value={form.driverName || ""} onChange={e=>setForm({...form,driverName:e.target.value})}/></Field><Field label="Driver phone"><input value={form.driverPhone || ""} onChange={e=>setForm({...form,driverPhone:e.target.value})}/></Field></> : <><Field label="Route code"><input value={form.code || ""} onChange={e=>setForm({...form,code:e.target.value})}/></Field><Field label="Origin"><input value={form.origin || ""} onChange={e=>setForm({...form,origin:e.target.value})}/></Field><Field label="Destination"><input value={form.destination || ""} onChange={e=>setForm({...form,destination:e.target.value})}/></Field></>}</>}
          {module === "feeding" && <><Field label="Create"><select value={form.objectType || "menu"} onChange={e=>setForm({...form,objectType:e.target.value})}><option value="menu">Meal menu</option><option value="budget">Budget</option><option value="service">Service log</option></select></Field>{form.objectType === "budget" ? <><Field label="Budget name"><input required value={form.name || ""} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Start"><input type="date" required value={form.periodStart || ""} onChange={e=>setForm({...form,periodStart:e.target.value})}/></Field><Field label="End"><input type="date" required value={form.periodEnd || ""} onChange={e=>setForm({...form,periodEnd:e.target.value})}/></Field><Field label="Planned amount"><input type="number" step="0.01" value={form.plannedAmount || ""} onChange={e=>setForm({...form,plannedAmount:e.target.value})}/></Field></> : form.objectType === "service" ? <><Field label="Date"><input type="date" required value={form.logDate || ""} onChange={e=>setForm({...form,logDate:e.target.value})}/></Field><Field label="Meal"><input required value={form.meal || ""} placeholder="Breakfast / lunch" onChange={e=>setForm({...form,meal:e.target.value})}/></Field><Field label="Served count"><input type="number" min="0" value={form.servedCount || ""} onChange={e=>setForm({...form,servedCount:e.target.value})}/></Field><Field label="Actual cost"><input type="number" step="0.01" value={form.actualCost || ""} onChange={e=>setForm({...form,actualCost:e.target.value})}/></Field></> : <><Field label="Menu date"><input type="date" required value={form.menuDate || ""} onChange={e=>setForm({...form,menuDate:e.target.value})}/></Field><Field label="Meal"><input required value={form.meal || ""} placeholder="Breakfast / lunch" onChange={e=>setForm({...form,meal:e.target.value})}/></Field><Field label="Items"><textarea value={form.items || ""} placeholder="Rice, stew, fruit, water…" rows={3} onChange={e=>setForm({...form,items:e.target.value})}/></Field><Field label="Planned cost"><input type="number" step="0.01" value={form.plannedCost || ""} onChange={e=>setForm({...form,plannedCost:e.target.value})}/></Field></>}</>}
          {module === "inventory" && <><Field label="Asset tag"><input required value={form.assetTag || ""} placeholder="AST-0001" onChange={e=>setForm({...form,assetTag:e.target.value})}/></Field><Field label="Asset name"><input required value={form.name || ""} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Category"><input required value={form.category || ""} placeholder="ICT, furniture, laboratory…" onChange={e=>setForm({...form,category:e.target.value})}/></Field><Field label="Serial number"><input value={form.serialNumber || ""} onChange={e=>setForm({...form,serialNumber:e.target.value})}/></Field><Field label="Location"><input value={form.location || ""} placeholder="Library / Lab 2" onChange={e=>setForm({...form,location:e.target.value})}/></Field><Field label="Condition"><select value={form.condition || "good"} onChange={e=>setForm({...form,condition:e.target.value})}><option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></Field><Field label="Purchase cost"><input type="number" step="0.01" value={form.purchaseCost || ""} onChange={e=>setForm({...form,purchaseCost:e.target.value})}/></Field><Field label="Notes"><textarea value={form.notes || ""} rows={3} onChange={e=>setForm({...form,notes:e.target.value})}/></Field></>}
          {module === "recruitment" && <><Field label="Job title"><input required value={form.title || ""} placeholder="Mathematics Teacher" onChange={e=>setForm({...form,title:e.target.value})}/></Field><Field label="Department"><input value={form.department || ""} placeholder="Academics" onChange={e=>setForm({...form,department:e.target.value})}/></Field><Field label="Employment type"><select value={form.employmentType || "Full-time"} onChange={e=>setForm({...form,employmentType:e.target.value})}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Temporary</option></select></Field><Field label="Closing date"><input type="date" value={form.closingDate || ""} onChange={e=>setForm({...form,closingDate:e.target.value})}/></Field><Field label="Role description"><textarea required rows={4} value={form.description || ""} onChange={e=>setForm({...form,description:e.target.value})}/></Field><Field label="Applicant instructions"><textarea rows={3} value={form.instructions || ""} placeholder="Documents, experience, availability…" onChange={e=>setForm({...form,instructions:e.target.value})}/></Field><div className="ops-question-builder"><span>Screening questions</span>{questions.map(q=><div className="ops-question" key={q.id}>{q.label}<button type="button" onClick={()=>setQuestions(questions.filter(item=>item.id!==q.id))}>×</button></div>)}<div className="ops-question-add"><input value={questionText} placeholder="e.g. Do you have a teaching qualification?" onChange={e=>setQuestionText(e.target.value)} /><button type="button" onClick={()=>{if(questionText.trim()){setQuestions([...questions,{id:crypto.randomUUID(),label:questionText.trim(),type:"longText",required:true}]);setQuestionText("");}}}>Add</button></div></div></>}
          <button className="ops-submit" disabled={busy}>{busy ? "Saving…" : meta.action}</button>
        </form>
      </aside>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="ops-field"><span>{label}</span>{children}</label>; }

function LibraryView({ rows }: { rows: AnyRow[] }) {
  return <div className="library-grid">{rows.map(book => { const digital=Boolean(book.fileUrl); return <article className="book-card" key={str(book.id)}><div className="book-cover">{book.coverUrl ? <img src={String(book.coverUrl)} alt="" /> : <div><small>{str(book.materialType,"book").toUpperCase()}</small><strong>{str(book.title).slice(0,2).toUpperCase()}</strong></div>}</div><div className="book-body"><span className="book-category">{str(book.category)}</span><h3>{str(book.title)}</h3><p>{str(book.author,"School resource")}</p><div className="book-meta"><span>{Number(book.availableCopies ?? 0)} available</span><span>{digital ? "Digital" : `${Number(book.copies ?? 0)} copies`}</span></div><div className="book-actions">{digital && <><a className="ops-link" href={String(book.fileUrl)} target="_blank" rel="noreferrer">Read</a><a className="ops-link secondary" href={String(book.fileUrl)} download>Download</a></>}</div></div></article>; })}{rows.length===0&&<Empty text="No learning materials match this search."/>}</div>;
}

function TransportView({ data, rows }: { data: AnyRow|null; rows: AnyRow[] }) {
  const locations = Array.isArray(data?.locations) ? data?.locations as AnyRow[] : [];
  const routes = Array.isArray(data?.routes) ? data?.routes as AnyRow[] : [];
  return <div className="ops-transport"><div className="route-board"><div className="route-board-head"><div><span>LIVE ROUTE BOARD</span><h3>Today's journeys</h3></div><strong>{locations.length} live signals</strong></div>{routes.slice(0,6).map(r=><div className="route-row" key={str(r.id)}><div className="route-dot"/><div><strong>{str(r.name)}</strong><span>{str(r.origin)} → {str(r.destination)}</span></div><div className="route-status">{locations.some(l=>l.routeId===r.id) ? "LIVE" : "READY"}</div></div>)}{routes.length===0&&<Empty text="Create routes to see the daily journey board."/>}</div><div className="fleet-strip">{rows.slice(0,8).map(v=><div className="fleet-card" key={str(v.id)}><span>VEHICLE</span><strong>{str(v.name,v.registrationNumber as string)}</strong><p>{str(v.registrationNumber)} · {Number(v.capacity||0)} seats</p><small>{str(v.driverName,"Driver not assigned")}</small></div>)}</div></div>;
}

function FeedingView({ data, rows }: { data: AnyRow|null; rows: AnyRow[] }) {
  return <div className="feeding-board"><div className="menu-feature"><span>MENU PREVIEW</span><h3>{rows[0] ? str(rows[0].meal,"Today") : "No menu yet"}</h3><p>{rows[0] && Array.isArray(rows[0].items) ? (rows[0].items as unknown[]).map(i => typeof i === "object" ? str((i as AnyRow).name) : String(i)).join(" · ") : "Create a menu with ingredients, allergens and planned cost."}</p><div className="food-bottom"><strong>{money(rows[0]?.plannedCost)}</strong><span>planned cost</span></div></div><div className="feeding-side"><div className="service-stat"><span>ACTUAL VS PLAN</span><strong>{money((data?.actualVsPlan as AnyRow | undefined)?.actual)}</strong><small>{Number((data?.actualVsPlan as AnyRow | undefined)?.utilizationPercent || 0).toFixed(1)}% used</small></div><div className="service-stat"><span>MENU DAYS</span><strong>{rows.length}</strong><small>recent menu records</small></div></div></div>;
}

function InventoryView({ rows }: { rows: AnyRow[] }) {
  return <div className="inventory-table"><table><thead><tr><th>Asset</th><th>Tag</th><th>Location</th><th>Condition</th><th>Status</th><th>Purchase</th></tr></thead><tbody>{rows.map(a=><tr key={str(a.id)}><td><strong>{str(a.name)}</strong><small>{str(a.category)}</small></td><td><span className="tag-chip">{str(a.assetTag)}</span></td><td>{str(a.location)}</td><td>{str(a.condition)}</td><td>{str(a.status)}</td><td>{money(a.purchaseCost)}</td></tr>)}{rows.length===0&&<tr><td colSpan={6}><Empty text="No assets yet. Start with the asset register."/></td></tr>}</tbody></table></div>;
}

function RecruitmentView({ rows, data, schoolId, publicLink, mutate }: { rows: AnyRow[]; data: AnyRow|null; schoolId:string; publicLink:(p:AnyRow)=>string; mutate:(endpoint:string,payload:Record<string,unknown>)=>Promise<unknown> }) {
  const applicants = Array.isArray(data?.applicants) ? data?.applicants as AnyRow[] : [];
  return <div className="recruitment-board"><div className="vacancy-list">{rows.map(p=><article className="vacancy-card" key={str(p.id)}><div><span>{str(p.department,"School")}</span><h3>{str(p.title)}</h3><p>{str(p.employmentType)} · {p.closingDate ? `Closes ${date(p.closingDate)}` : "Open until closed"}</p></div><div className="vacancy-actions"><span className={`status-chip ${str(p.status,"open")}`}>{str(p.status)}</span><button onClick={()=>mutate("/api/school/operations/recruitment",{action:"setStatus",postingId:p.id,status:p.status==="open"?"paused":"open"})}>{p.status==="open"?"Pause":"Open"}</button>{p.publicToken&&<button onClick={()=>navigator.clipboard.writeText(publicLink(p))}>Copy application link</button>}</div></article>)}{rows.length===0&&<Empty text="Create the first vacancy and publish a professional application page."/>}</div><div className="applicant-pipeline"><div className="pipeline-head"><div><span>CANDIDATE PIPELINE</span><h3>{applicants.length} applicants</h3></div><small>New → screening → interview → offer</small></div><div className="pipeline-columns">{["new","screening","interview","offer"].map(stage=><div key={stage} className="pipeline-col"><span>{stage}</span><strong>{applicants.filter(a=>str(a.status,"new")===stage).length}</strong>{applicants.filter(a=>str(a.status,"new")===stage).slice(0,4).map(a=><div className="candidate-mini" key={str(a.id)}><strong>{str(a.name)}</strong><small>{str(a.email,a.phone as string)}</small></div>)}</div>)}</div></div></div>;
}

function Empty({ text }: { text:string }) { return <div className="ops-empty"><strong>{text}</strong><span>Use the workflow panel to get this workspace moving.</span></div>; }
