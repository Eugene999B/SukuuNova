"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Module = "library" | "transport" | "feeding" | "inventory" | "recruitment";
type Row = Record<string, unknown>;
type Props = { module: Module; schoolName: string; userName: string; schoolId: string };

type LibraryBook = Row & { id: string };
type LibraryLoan = Row & { id: string };
type Vehicle = Row & { id: string };
type Route = Row & { id: string };
type FeedingMenu = Row & { id: string };
type FeedingBudget = Row & { id: string };
type FeedingLog = Row & { id: string };
type Asset = Row & { id: string };
type Posting = Row & { id: string };
type Applicant = Row & { id: string };

const META: Record<Module, { title: string; kicker: string; description: string }> = {
  library: { title: "Learning Library", kicker: "Knowledge centre", description: "A proper school library for print, digital and multimedia learning resources." },
  transport: { title: "Transport Command Centre", kicker: "Safe journeys", description: "Coordinate vehicles, routes, stops, boarding, live signals and compliance from one control room." },
  feeding: { title: "Feeding & Catering", kicker: "Meals & nourishment", description: "Plan menus, budgets and service records while keeping actual food costs visible." },
  inventory: { title: "Assets & Inventory", kicker: "School assets", description: "Know what the school owns, where it is, who has custody and what needs attention." },
  recruitment: { title: "Talent & Recruitment", kicker: "People operations", description: "Create professional vacancies, publish public application links and manage candidates through hiring." },
};

const text = (value: unknown, fallback = "—") => typeof value === "string" && value.trim() ? value : fallback;
const num = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const money = (value: unknown) => `GHS ${num(value).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value: unknown) => {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? text(value) : d.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
};
const bool = (value: unknown) => Boolean(value);
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object") : [];
const asJson = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

async function requestJson(endpoint: string, init?: RequestInit) {
  const response = await fetch(endpoint, { cache: "no-store", ...init });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload && typeof payload === "object" && "error" in payload ? text((payload as Row).error, "Request failed") : "Request failed.");
  return asJson(payload);
}

function Field({ label, name, type = "text", placeholder, required = false, children }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean; children?: React.ReactNode }) {
  return <label className="sl-field"><span>{label}</span>{children ?? <input name={name} type={type} placeholder={placeholder} required={required} />}</label>;
}

function ActionButton({ children, variant = "primary", type = "submit", disabled = false }: { children: React.ReactNode; variant?: "primary" | "secondary" | "ghost"; type?: "submit" | "button"; disabled?: boolean }) {
  return <button type={type} className={`sl-button sl-button-${variant}`} disabled={disabled}>{children}</button>;
}

function Empty({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <div className="sl-empty"><div className="sl-empty-mark">✦</div><strong>{title}</strong><p>{detail}</p>{action}</div>;
}

function Panel({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="sl-panel"><div className="sl-panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

export default function SchoolOperationsStudio({ module, schoolName, userName, schoolId }: Props) {
  const meta = META[module];
  const endpoint = module === "library" ? "/api/school/operations/library" : module === "recruitment" ? "/api/school/operations/recruitment" : module === "inventory" ? "/api/phase3/assets" : `/api/phase3/${module}`;
  const [data, setData] = useState<Row>({});
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(module === "library" ? "catalogue" : module === "transport" ? "control" : module === "feeding" ? "menus" : module === "inventory" ? "assets" : "vacancies");

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await requestJson(endpoint);
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workspace could not be loaded.");
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  const post = async (target: string, body: Row) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestJson(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setNotice("Saved successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>, body: Row, success: string) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData(event.currentTarget);
      const input: Row = { ...body };
      form.forEach((value, key) => { if (value !== "") input[key] = String(value); });
      await requestJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      setNotice(success);
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const payload = useMemo(() => ({
    books: asRows(data.books) as LibraryBook[],
    loans: asRows(data.loans) as LibraryLoan[],
    vehicles: asRows(data.vehicles) as Vehicle[],
    routes: asRows(data.routes) as Route[],
    stops: asRows(data.stops),
    locations: asRows(data.locations),
    boarding: asRows(data.boarding),
    reminders: asRows(data.reminders),
    menus: asRows(data.menus) as FeedingMenu[],
    budgets: asRows(data.budgets) as FeedingBudget[],
    logs: asRows(data.logs) as FeedingLog[],
    assets: asRows(data.assets) as Asset[],
    postings: asRows(data.postings) as Posting[],
    applicants: asRows(data.applicants) as Applicant[],
  }), [data]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return payload.books;
    return payload.books.filter(book => JSON.stringify(book).toLowerCase().includes(term));
  }, [payload.books, query]);

  const heroStats = module === "library"
    ? [{ label: "Catalogue", value: payload.books.length }, { label: "On loan", value: payload.loans.filter(loan => text(loan.displayStatus, text(loan.status)) === "borrowed").length }, { label: "Overdue", value: payload.loans.filter(loan => text(loan.displayStatus) === "overdue").length }]
    : module === "transport"
      ? [{ label: "Vehicles", value: payload.vehicles.length }, { label: "Routes", value: payload.routes.length }, { label: "Compliance", value: payload.reminders.filter(row => text(row.status, "pending") === "pending").length }]
      : module === "feeding"
        ? [{ label: "Menus", value: payload.menus.length }, { label: "Budgets", value: payload.budgets.length }, { label: "Meal logs", value: payload.logs.length }]
        : module === "inventory"
          ? [{ label: "Assets", value: payload.assets.length }, { label: "Active", value: payload.assets.filter(row => text(row.status, "active") === "active").length }, { label: "Attention", value: payload.assets.filter(row => ["damaged", "maintenance", "lost"].includes(text(row.condition).toLowerCase())).length }]
          : [{ label: "Vacancies", value: payload.postings.length }, { label: "Applicants", value: payload.applicants.length }, { label: "Open roles", value: payload.postings.filter(row => text(row.status, "open") === "open").length }];

  const renderLibrary = () => (
    <>
      <div className="sl-tabbar">
        {[["catalogue", "Catalogue"], ["loans", "Circulation"], ["add", "Add material"]].map(([key, label]) => <button key={key} type="button" className={view === key ? "is-active" : ""} onClick={() => setView(key)}>{label}</button>)}
      </div>
      {view === "catalogue" && <>
        <Panel title="Discover the collection" subtitle="Search by title, author, category, material type or tags.">
          <div className="sl-search-row"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search books, PDFs, worksheets, media…" /><span>{filtered.length} shown</span></div>
          {filtered.length ? <div className="sl-book-grid">{filtered.map(book => {
            const cover = text(book.coverUrl, "");
            const file = text(book.fileUrl, "");
            const available = num(book.availableCopies, num(book.copies));
            return <article className="sl-book-card" key={book.id}>
              <div className="sl-book-cover">{cover ? <img src={cover} alt="" /> : <div><small>{text(book.materialType, "BOOK").toUpperCase()}</small><strong>{text(book.title, "Untitled").slice(0, 2).toUpperCase()}</strong></div>}</div>
              <div className="sl-book-body"><div className="sl-badge-row"><span>{text(book.category, "General")}</span><span>{text(book.materialType, "book")}</span></div><h3>{text(book.title, "Untitled resource")}</h3><p>{text(book.author, "School resource")}</p><div className="sl-book-foot"><span>{available} available</span><span>{file ? "Digital access" : `${num(book.copies)} copies`}</span></div>{file && <div className="sl-inline-actions"><a href={file} target="_blank" rel="noreferrer">Read</a><a href={file} download>Download</a></div>}</div>
            </article>;
          })}</div> : <Empty title="Your catalogue is ready for its first title" detail="Add textbooks, novels, past papers, PDFs, worksheets, audio, video and other learning materials. Rich metadata and accessibility fields are stored with each record." action={<ActionButton type="button" onClick={() => setView("add")}>Add the first material</ActionButton> as React.ReactNode} />}
        </Panel>
        <Panel title="Library principles" subtitle="Built around modern discovery, accessibility and circulation practice."><div className="sl-principle-grid"><div><strong>Any learning format</strong><span>Books, eBooks, PDFs, worksheets, audio, video, magazines and documents.</span></div><div><strong>Accessible discovery</strong><span>Accessibility features can be recorded so learners can find suitable resources.</span></div><div><strong>Physical + digital</strong><span>Track copies and loans while still offering direct digital reading and downloads.</span></div></div></Panel>
      </>}
      {view === "loans" && <div className="sl-two-col"><Panel title="Circulation desk" subtitle="Issue or receive physical copies."><form onSubmit={event => submit(event, { action: "borrow", days: 14 }, "Book issued successfully.")} className="sl-form"><Field label="Book ID" name="bookId" placeholder="Paste the library book ID" required /><Field label="Student ID" name="studentId" placeholder="Student receiving the book" required /><Field label="Due date" name="dueAt" type="date" required /><ActionButton disabled={busy}>Issue book</ActionButton></form></Panel><Panel title="Recent loans" subtitle="Overdue items are highlighted automatically.">{payload.loans.length ? <div className="sl-list">{payload.loans.slice(0, 20).map(loan => <div className="sl-list-item" key={loan.id}><div><strong>{text(loan.bookId, "Book")}</strong><span>{text(loan.studentId, "Student")} · due {dateLabel(loan.dueAt)}</span></div><div className={`sl-status sl-status-${text(loan.displayStatus, text(loan.status, "borrowed"))}`}>{text(loan.displayStatus, text(loan.status, "borrowed"))}</div></div>)}</div> : <Empty title="No circulation activity yet" detail="Loans and returns will appear here as librarians issue books." />}</Panel></div>}
      {view === "add" && <div className="sl-two-col"><Panel title="Add learning material" subtitle="Create a catalogue record for any approved school learning resource."><form onSubmit={event => submit(event, { action: "createBook", copies: 1 }, "Material added to the library.")} className="sl-form sl-form-grid"><Field label="Title" name="title" placeholder="e.g. Integrated Science for JHS 2" required /><Field label="Author / creator" name="author" placeholder="Author, teacher, publisher…" /><Field label="Category" name="category" placeholder="Subject, fiction, reference…" required /><Field label="Material type" name="materialType"><select name="materialType" defaultValue="book"><option value="book">Book / textbook</option><option value="ebook">eBook</option><option value="pdf">PDF</option><option value="worksheet">Worksheet</option><option value="past-paper">Past paper</option><option value="audio">Audio</option><option value="video">Video</option><option value="document">Document</option><option value="magazine">Magazine</option><option value="other">Other</option></select></Field><Field label="ISBN / identifier" name="isbn" /><Field label="Copies" name="copies" type="number" placeholder="1" /><Field label="Cover image URL" name="coverUrl" placeholder="https://…" /><Field label="Digital file URL" name="fileUrl" placeholder="https://…" /><Field label="Publisher" name="publisher" /><Field label="Published year" name="publishedYear" type="number" /><Field label="Language" name="language" placeholder="English" /><Field label="Tags" name="tags" placeholder="science, jhs2, revision" /><label className="sl-field sl-field-wide"><span>Description</span><textarea name="description" rows={4} placeholder="What will learners or teachers find in this resource?" /></label><label className="sl-field sl-field-wide"><span>Accessibility notes</span><textarea name="accessibility" rows={3} placeholder="e.g. captions available, accessible PDF, large print…" /></label><div className="sl-form-end"><ActionButton disabled={busy}>Add to catalogue</ActionButton><span>Permission-controlled. Changes are audited in the school workspace.</span></div></form></Panel><Panel title="What a complete record can hold" subtitle="Rich enough for a serious digital school library."><div className="sl-feature-list"><span>▸ Curriculum / subject categorisation</span><span>▸ Cover art and thumbnail presentation</span><span>▸ Read online and download links</span><span>▸ Physical copy count and circulation</span><span>▸ Publisher, year, language and identifiers</span><span>▸ Accessibility information</span><span>▸ Searchable tags and descriptions</span><span>▸ Parent / student access can follow existing permissions</span></div></Panel></div>}
    </>
  );

  const renderTransport = () => (
    <>
      <div className="sl-tabbar">{[["control", "Control room"], ["fleet", "Fleet"], ["routes", "Routes"], ["boarding", "Boarding"], ["add", "Add vehicle"]].map(([key, label]) => <button type="button" key={key} className={view === key ? "is-active" : ""} onClick={() => setView(key)}>{label}</button>)}</div>
      {view === "control" && <div className="sl-dashboard-grid"><Panel title="Fleet at a glance" subtitle="Current vehicles and their latest operating signals."><div className="sl-vehicle-grid">{payload.vehicles.length ? payload.vehicles.map(vehicle => <article className="sl-vehicle-card" key={vehicle.id}><div className="sl-vehicle-top"><span className="sl-vehicle-icon">BUS</span><div className="sl-status sl-status-active">{text(vehicle.status, "active")}</div></div><h3>{text(vehicle.name, "School bus")}</h3><p>{text(vehicle.registrationNumber, "No registration")}</p><div className="sl-vehicle-meta"><span>{num(vehicle.capacity)} seats</span><span>{text(vehicle.driverName, "Driver not assigned")}</span></div></article>) : <Empty title="No vehicles registered" detail="Create the school's fleet before adding routes and boarding activity." action={<ActionButton type="button" onClick={() => setView("add")}>Register vehicle</ActionButton> as React.ReactNode} />}</div></Panel><Panel title="Safety & compliance" subtitle="Upcoming checks and operational warnings.">{payload.reminders.length ? <div className="sl-list">{payload.reminders.slice(0, 12).map(row => <div className="sl-list-item" key={text(row.id)}><div><strong>{text(row.kind, "Compliance item")}</strong><span>{text(row.vehicleId, "Vehicle")} · due {dateLabel(row.dueAt)}</span></div><div className="sl-status sl-status-pending">{text(row.status, "pending")}</div></div>)}</div> : <Empty title="No pending compliance items" detail="Use the fleet workflow to record insurance, servicing, licensing and inspection reminders." />}</Panel></div>}
      {view === "fleet" && <Panel title="Fleet register" subtitle="Capacity, driver assignment and operating status."><div className="sl-table-wrap"><table><thead><tr><th>Vehicle</th><th>Registration</th><th>Capacity</th><th>Driver</th><th>Status</th></tr></thead><tbody>{payload.vehicles.map(row => <tr key={row.id}><td><strong>{text(row.name)}</strong></td><td>{text(row.registrationNumber)}</td><td>{num(row.capacity)}</td><td>{text(row.driverName)}</td><td><span className="sl-status sl-status-active">{text(row.status, "active")}</span></td></tr>)}</tbody></table></div></Panel>}
      {view === "routes" && <div className="sl-two-col"><Panel title="Route board" subtitle="Origin, destination and linked stops.">{payload.routes.length ? <div className="sl-route-board">{payload.routes.map(route => <article key={route.id}><div><span>ROUTE</span><strong>{text(route.name)}</strong><p>{text(route.origin, "Origin")} <b>→</b> {text(route.destination, "Destination")}</p></div><em>{text(route.code, "—")}</em><small>{payload.stops.filter(stop => text(stop.routeId) === route.id).length} stops linked</small></article>)}</div> : <Empty title="No routes yet" detail="Create your route network after registering the fleet." />}</Panel><Panel title="Route safety view" subtitle="Capture stop coordinates and ETA data for safer route planning."><div className="sl-route-safety"><strong>{payload.stops.length} stop records</strong><span>{payload.locations.length} latest vehicle location signals</span><p>NHTSA route-planning practice emphasizes evaluating stop safety and the pedestrian paths children use to reach the bus. SukuuNova keeps route, stop, ETA and location data together so those reviews can become part of the operating workflow.</p></div></Panel></div>}
      {view === "boarding" && <Panel title="Boarding activity" subtitle="Latest boarded and alighted events visible to authorized school operators.">{payload.boarding.length ? <div className="sl-list">{payload.boarding.slice(0, 30).map(row => <div className="sl-list-item" key={text(row.id)}><div><strong>{text(row.studentId, "Student")}</strong><span>{text(row.vehicleId, "Vehicle")} · {text(row.stopId, "Stop")}</span></div><div><span className="sl-status sl-status-active">{text(row.type)}</span></div></div>)}</div> : <Empty title="No boarding events" detail="Use the transport boarding workflow to record student movement and trigger guardian alerts." />}</Panel>}
      {view === "add" && <div className="sl-two-col"><Panel title="Register vehicle" subtitle="Create a fleet record before assigning routes or boarding activity."><form className="sl-form sl-form-grid" onSubmit={event => submit(event, { action: "createVehicle" }, "Vehicle registered.")}><Field label="Vehicle name" name="name" placeholder="Bus 01 / Van A" required /><Field label="Registration number" name="registrationNumber" placeholder="GT 1234-24" required /><Field label="Capacity" name="capacity" type="number" placeholder="40" required /><Field label="Driver name" name="driverName" /><Field label="Driver phone" name="driverPhone" /><div className="sl-form-end"><ActionButton disabled={busy}>Register vehicle</ActionButton></div></form></Panel><Panel title="Next operational steps"><div className="sl-feature-list"><span>▸ Create safe school routes and stops</span><span>▸ Link stops with sequence and ETA</span><span>▸ Record vehicle location signals</span><span>▸ Record boarding / alighting</span><span>▸ Track compliance reminders</span><span>▸ Trigger guardian transport alerts through the existing service</span></div></Panel></div>}
    </>
  );

  const planned = payload.budgets.reduce((sum, row) => sum + num(row.plannedAmount), 0);
  const actual = payload.logs.reduce((sum, row) => sum + num(row.actualCost), 0);
  const variance = actual - planned;

  const renderFeeding = () => (
    <>
      <div className="sl-tabbar">{[["menus", "Menu planner"], ["service", "Meal service"], ["budget", "Budget"], ["add", "New menu"]].map(([key, label]) => <button type="button" key={key} className={view === key ? "is-active" : ""} onClick={() => setView(key)}>{label}</button>)}</div>
      {view === "menus" && <div className="sl-two-col"><Panel title="Upcoming menu calendar" subtitle="Plan several weeks ahead and keep a clean service record.">{payload.menus.length ? <div className="sl-menu-grid">{payload.menus.slice(0, 21).map(menu => <article key={menu.id}><span>{dateLabel(menu.menuDate)}</span><h3>{text(menu.meal, "Meal")}</h3><p>{Array.isArray(menu.items) ? (menu.items as unknown[]).map(String).join(" · ") : text(menu.items, "Menu items not listed")}</p><strong>{money(menu.plannedCost)}</strong></article>)}</div> : <Empty title="No menus planned" detail="Create a rotating menu schedule, then log actual service and cost against it." action={<ActionButton type="button" onClick={() => setView("add")}>Plan first menu</ActionButton> as React.ReactNode} />}</Panel><Panel title="Cost pulse" subtitle="Plan versus actual school feeding spend."><div className="sl-finance-pulse"><div><span>Planned</span><strong>{money(planned)}</strong></div><div><span>Actual</span><strong>{money(actual)}</strong></div><div><span>Variance</span><strong>{money(variance)}</strong></div></div><p className="sl-panel-note">Planning and production records should be usable for purchasing, accountability and reporting—not only as a list of meals.</p></Panel></div>}
      {view === "service" && <Panel title="Meal service log" subtitle="Record what was actually prepared and served."><div className="sl-service-strip"><div><span>Menus</span><strong>{payload.menus.length}</strong></div><div><span>Service logs</span><strong>{payload.logs.length}</strong></div><div><span>Served today</span><strong>{payload.logs.reduce((sum, row) => sum + num(row.servedCount), 0)}</strong></div></div>{payload.logs.length ? <div className="sl-list">{payload.logs.slice(0, 25).map(row => <div className="sl-list-item" key={row.id}><div><strong>{text(row.meal, "Meal")}</strong><span>{dateLabel(row.logDate)} · {num(row.servedCount)} meals served</span></div><strong>{money(row.actualCost)}</strong></div>)}</div> : <Empty title="No meal service recorded" detail="Log the number of meals served and actual cost for each service day." />}</Panel>}
      {view === "budget" && <div className="sl-two-col"><Panel title="Feeding budgets"><div className="sl-list">{payload.budgets.length ? payload.budgets.map(row => <div className="sl-list-item" key={row.id}><div><strong>{text(row.name, "Budget")}</strong><span>{dateLabel(row.periodStart)} → {dateLabel(row.periodEnd)}</span></div><strong>{money(row.plannedAmount)}</strong></div>) : <Empty title="No feeding budgets" detail="Set term or period budgets so catering performance can be measured." />}</div></Panel><Panel title="Create budget"><form className="sl-form" onSubmit={event => submit(event, { action: "createBudget" }, "Feeding budget created.")}><Field label="Budget name" name="name" placeholder="First term catering" required /><Field label="Period start" name="periodStart" type="date" required /><Field label="Period end" name="periodEnd" type="date" required /><Field label="Planned amount" name="plannedAmount" type="number" placeholder="0.00" required /><ActionButton disabled={busy}>Create budget</ActionButton></form></Panel></div>}
      {view === "add" && <div className="sl-two-col"><Panel title="Plan a menu" subtitle="Use clear menu records that can feed later service and cost reporting."><form className="sl-form sl-form-grid" onSubmit={event => submit(event, { action: "createMenu", items: [] }, "Menu added to the plan.")}><Field label="Menu date" name="menuDate" type="date" required /><Field label="Meal name" name="meal" placeholder="Jollof rice, beans, fruit…" required /><Field label="Planned cost" name="plannedCost" type="number" placeholder="0.00" /><label className="sl-field sl-field-wide"><span>Menu items</span><textarea name="itemsText" rows={6} placeholder="One item per line" /></label><div className="sl-form-end"><ActionButton disabled={busy}>Create menu</ActionButton><span>Operational guidance: menus should be planned ahead, while production/service records capture what was actually prepared and served.</span></div></form></Panel><Panel title="Why this matters"><div className="sl-feature-list"><span>▸ Plan several weeks in cycles</span><span>▸ Compare planned and actual cost</span><span>▸ Record meal counts</span><span>▸ Retain procurement / invoice evidence</span><span>▸ Track menu variety and consistency</span><span>▸ Keep a term-level catering history</span></div></Panel></div>}
    </>
  );

  const renderInventory = () => (
    <>
      <div className="sl-tabbar">{[["assets", "Asset register"], ["attention", "Attention"], ["add", "Add asset"]].map(([key, label]) => <button type="button" key={key} className={view === key ? "is-active" : ""} onClick={() => setView(key)}>{label}</button>)}</div>
      {view === "assets" && <Panel title="What the school owns" subtitle="A lifecycle view of assets, location, condition, cost and custody.">{payload.assets.length ? <div className="sl-asset-grid">{payload.assets.map(asset => <article className="sl-asset-card" key={asset.id}><div className="sl-asset-top"><span>{text(asset.category, "ASSET")}</span><span className="sl-status sl-status-active">{text(asset.status, "active")}</span></div><h3>{text(asset.name, "Unnamed asset")}</h3><p>{text(asset.assetTag, "No tag")}</p><div className="sl-asset-meta"><div><span>Location</span><strong>{text(asset.location)}</strong></div><div><span>Condition</span><strong>{text(asset.condition, "good")}</strong></div><div><span>Cost</span><strong>{money(asset.purchaseCost)}</strong></div></div></article>)}</div> : <Empty title="No assets entered" detail="Start the asset register with tagged equipment, furniture, ICT, vehicles and other school-owned property." action={<ActionButton type="button" onClick={() => setView("add")}>Add first asset</ActionButton> as React.ReactNode} />}</Panel>}
      {view === "attention" && <Panel title="Assets needing attention" subtitle="Flag damaged, lost or maintenance-sensitive records. ">{payload.assets.filter(row => ["damaged", "maintenance", "lost"].includes(text(row.condition).toLowerCase()) || ["lost", "maintenance"].includes(text(row.status).toLowerCase())).length ? <div className="sl-list">{payload.assets.filter(row => ["damaged", "maintenance", "lost"].includes(text(row.condition).toLowerCase()) || ["lost", "maintenance"].includes(text(row.status).toLowerCase())).map(row => <div className="sl-list-item" key={row.id}><div><strong>{text(row.name)}</strong><span>{text(row.assetTag)} · {text(row.location)}</span></div><span className="sl-status sl-status-pending">{text(row.condition, text(row.status))}</span></div>)}</div> : <Empty title="Nothing flagged" detail="Keep conditions and status current so maintenance, audit and lifecycle work becomes visible." />}</Panel>}
      {view === "add" && <div className="sl-two-col"><Panel title="Add asset" subtitle="Tag the asset once, then update location, condition and custody throughout its life."><form className="sl-form sl-form-grid" onSubmit={event => submit(event, { action: "create" }, "Asset added to the register.")}><Field label="Asset tag" name="assetTag" placeholder="AST-2026-0001" required /><Field label="Asset name" name="name" placeholder="Laptop / projector / desk" required /><Field label="Category" name="category" placeholder="ICT, furniture, vehicle…" /><Field label="Serial number" name="serialNumber" /><Field label="Location" name="location" placeholder="ICT lab / office 3" /><Field label="Condition" name="condition"><select name="condition" defaultValue="good"><option value="good">Good</option><option value="new">New</option><option value="fair">Fair</option><option value="damaged">Damaged</option><option value="maintenance">Maintenance</option><option value="lost">Lost</option></select></Field><Field label="Purchase date" name="purchaseDate" type="date" /><Field label="Purchase cost" name="purchaseCost" type="number" placeholder="0.00" /><label className="sl-field sl-field-wide"><span>Notes</span><textarea name="notes" rows={4} placeholder="Warranty, supplier, custody, maintenance notes…" /></label><div className="sl-form-end"><ActionButton disabled={busy}>Add asset</ActionButton></div></form></Panel><Panel title="Lifecycle view"><div className="sl-lifecycle"><span>1 · Acquire</span><span>2 · Tag & receive</span><span>3 · Assign / locate</span><span>4 · Maintain & audit</span><span>5 · Repair / transfer</span><span>6 · Retire / dispose</span></div></Panel></div>}
    </>
  );

  const applicantStages = ["new", "screening", "interview", "offer", "hired", "rejected"];
  const renderRecruitment = () => (
    <>
      <div className="sl-tabbar">{[["vacancies", "Vacancies"], ["pipeline", "Candidate pipeline"], ["create", "Create vacancy"]].map(([key, label]) => <button type="button" key={key} className={view === key ? "is-active" : ""} onClick={() => setView(key)}>{label}</button>)}</div>
      {view === "vacancies" && <div className="sl-two-col"><Panel title="Open opportunities" subtitle="Each vacancy can have its own public application link and screening questions.">{payload.postings.length ? <div className="sl-vacancy-grid">{payload.postings.map(posting => { const applicants = payload.applicants.filter(app => text(app.postingId) === posting.id); return <article className="sl-vacancy-card" key={posting.id}><div className="sl-vacancy-top"><span>{text(posting.department, "School")}</span><div className="sl-status sl-status-active">{text(posting.status, "open")}</div></div><h3>{text(posting.title, "Vacancy")}</h3><p>{text(posting.employmentType, "Employment")}</p><div className="sl-vacancy-meta"><span>Closes {dateLabel(posting.closingDate)}</span><span>{applicants.length} applicants</span></div><div className="sl-inline-actions"><button type="button" onClick={() => void post(endpoint, { action: "getPublicLink", postingId: posting.id })}>Get public link</button><button type="button" onClick={() => void post(endpoint, { action: "setStatus", postingId: posting.id, status: text(posting.status, "open") === "open" ? "paused" : "open" })}>{text(posting.status, "open") === "open" ? "Pause" : "Open"}</button></div></article>; })}</div> : <Empty title="No vacancies published" detail="Create a role, add structured screening questions and generate a shareable application link." action={<ActionButton type="button" onClick={() => setView("create")}>Create a vacancy</ActionButton> as React.ReactNode} />}</Panel><Panel title="Recruitment signal" subtitle="What a modern ATS-style school workflow gives the director and hiring team."><div className="sl-feature-list"><span>▸ Branded vacancy page</span><span>▸ Public link for anyone you invite</span><span>▸ Structured screening questions</span><span>▸ Candidate pipeline by stage</span><span>▸ CV / cover letter capture</span><span>▸ Interview and decision-ready candidate records</span><span>▸ Convert a successful applicant into a staff account</span></div></Panel></div>}
      {view === "pipeline" && <Panel title="Candidate pipeline" subtitle="Track every applicant from new submission to hiring decision."><div className="sl-kanban">{applicantStages.map(stage => <section key={stage}><header><span>{stage}</span><strong>{payload.applicants.filter(app => text(app.status, "new") === stage).length}</strong></header><div>{payload.applicants.filter(app => text(app.status, "new") === stage).slice(0, 12).map(app => <article key={app.id}><strong>{text(app.name)}</strong><span>{text(app.email, text(app.phone, "Contact not supplied"))}</span><small>{text(app.postingId, "Vacancy")}</small></article>)}</div></section>)}</div></Panel>}
      {view === "create" && <div className="sl-two-col"><Panel title="Create vacancy" subtitle="Build a professional public application page around the director's instructions."><form className="sl-form sl-form-grid" onSubmit={event => submit(event, { action: "createPosting", screeningQuestions: [] }, "Vacancy published and public link created.")}><Field label="Job title" name="title" placeholder="Senior Mathematics Teacher" required /><Field label="Department" name="department" placeholder="Academics" /><Field label="Employment type" name="employmentType" placeholder="Full-time" /><Field label="Closing date" name="closingDate" type="date" /><label className="sl-field sl-field-wide"><span>Job description</span><textarea name="description" rows={7} placeholder="Role, responsibilities, qualifications, experience…" /></label><label className="sl-field sl-field-wide"><span>Applicant instructions</span><textarea name="instructions" rows={5} placeholder="Documents, reference instructions, submission guidance…" /></label><label className="sl-field sl-field-wide"><span>Screening questions</span><textarea name="screeningQuestionsText" rows={7} placeholder="One question per line. Example: Do you hold a current teaching licence?" /></label><div className="sl-form-end"><ActionButton disabled={busy}>Publish vacancy</ActionButton><span>A public token is generated by the recruitment service and can be shared with applicants.</span></div></form></Panel><Panel title="Candidate experience"><div className="sl-public-preview"><span className="sl-public-label">PUBLIC APPLICATION</span><h3>Your school · your vacancy</h3><p>Applicants receive a focused mobile-friendly page with the role details, instructions and questions, then submit their contact details and documents.</p><div className="sl-public-flow"><span>1 · Read role</span><span>2 · Answer questions</span><span>3 · Submit</span><span>4 · Receive acknowledgement</span></div></div></Panel></div>}
    </>
  );

  const content = module === "library" ? renderLibrary() : module === "transport" ? renderTransport() : module === "feeding" ? renderFeeding() : module === "inventory" ? renderInventory() : renderRecruitment();

  return <main className={`school-life-studio school-life-${module}`}>
    <header className="sl-hero">
      <div className="sl-hero-copy"><span className="sl-kicker">SUKUUNOVA · {meta.kicker}</span><h1>{meta.title}</h1><p>{meta.description}</p><div className="sl-hero-meta"><span>{schoolName}</span><span>{userName}</span><span>School ID · {schoolId}</span></div></div>
      <div className="sl-hero-visual"><div className="sl-hero-glow" /><div className="sl-hero-card"><span>OPERATING WORKSPACE</span><strong>{module === "library" ? "Find · read · borrow" : module === "transport" ? "Route · board · protect" : module === "feeding" ? "Plan · serve · measure" : module === "inventory" ? "Tag · track · maintain" : "Publish · screen · hire"}</strong><small>Permission-aware school operations</small></div></div>
    </header>
    <section className="sl-statbar">{heroStats.map(stat => <div key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong></div>)}</section>
    {(notice || error) && <div className={`sl-alert ${error ? "is-error" : ""}`} role="status">{error || notice}</div>}
    {content}
  </main>;
}
