"use client";

import { useEffect, useMemo, useState } from "react";

type Module = "library" | "transport" | "feeding" | "inventory" | "recruitment";
type Row = Record<string, unknown>;
type Props = { module: Module; schoolName: string; userName: string; schoolId: string };

const META: Record<Module, { title: string; subtitle: string; action: string }> = {
  library: { title: "Learning Library", subtitle: "Catalogue books and digital learning materials.", action: "Add material" },
  transport: { title: "Transport Command Centre", subtitle: "Manage vehicles, routes and daily transport operations.", action: "Add vehicle" },
  feeding: { title: "Feeding & Catering", subtitle: "Plan menus, budgets and meal service.", action: "Create menu" },
  inventory: { title: "Assets & Inventory", subtitle: "Track school assets, custody, condition and cost.", action: "Add asset" },
  recruitment: { title: "Talent & Recruitment", subtitle: "Publish vacancies and manage the applicant pipeline.", action: "Create vacancy" },
};

const getText = (value: unknown, fallback = "—") => typeof value === "string" && value.trim() ? value : fallback;
const getNumber = (value: unknown) => Number(value ?? 0);
const formatMoney = (value: unknown) => `GHS ${getNumber(value).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SchoolOperationsStudio({ module, schoolName, userName, schoolId }: Props) {
  const meta = META[module];
  const [data, setData] = useState<Row>({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const endpoint = module === "library"
    ? "/api/school/operations/library"
    : module === "recruitment"
      ? "/api/school/operations/recruitment"
      : module === "inventory"
        ? "/api/phase3/assets"
        : `/api/phase3/${module}`;

  async function load() {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("The workspace could not be loaded.");
      setData(payload && typeof payload === "object" ? payload as Row : {});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The workspace could not be loaded.");
    }
  }

  useEffect(() => { void load(); }, [endpoint]);

  const records = useMemo<Row[]>(() => {
    const key = module === "library" ? "books" : module === "transport" ? "vehicles" : module === "feeding" ? "menus" : module === "inventory" ? "assets" : "postings";
    const source: Row[] = Array.isArray(data[key])
      ? data[key].filter((item): item is Row => Boolean(item) && typeof item === "object")
      : [];
    const term = query.trim().toLowerCase();
    return source.filter(item => !term || JSON.stringify(item).toLowerCase().includes(term));
  }, [data, module, query]);

  const titleFor = (row: Row) => getText(row.title, getText(row.name, getText(row.registrationNumber, getText(row.assetTag, "Record"))));

  async function startWorkflow() {
    setBusy(true);
    setMessage(`${meta.action} is ready. Use the module workflow controls to continue.`);
    setBusy(false);
  }

  return (
    <main className="ops-studio">
      <header className="ops-hero">
        <div>
          <span className="ops-eyebrow">SUKUUNOVA · SCHOOL OPERATIONS</span>
          <h1>{meta.title}</h1>
          <p>{meta.subtitle}</p>
          <div className="ops-hero-tags"><span>{schoolName}</span><span>{userName}</span></div>
        </div>
        <div className="ops-hero-art" aria-hidden="true">
          <div className="ops-orb ops-orb-a" />
          <div className="ops-orb ops-orb-b" />
          <div className="ops-art-card"><strong>{module === "library" ? "Read · learn · discover" : module === "transport" ? "Every journey visible" : module === "feeding" ? "Plan · serve · account" : module === "inventory" ? "Know what you own" : "Hire with confidence"}</strong><span>Live school workspace</span></div>
        </div>
      </header>

      <section className="ops-toolbar">
        <div><strong>{records.length} records</strong><span>{schoolId}</span></div>
        <div className="ops-toolbar-actions"><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${meta.title.toLowerCase()}…`} aria-label={`Search ${meta.title}`} /><button type="button" className="ops-primary" onClick={() => void startWorkflow()} disabled={busy}>{meta.action}</button></div>
      </section>

      {message && <div className="ops-message" role="status">{message}</div>}

      <section className="ops-kpis">
        <div className="ops-kpi"><span>Records</span><strong>{records.length}</strong><small>Current view</small></div>
        <div className="ops-kpi"><span>Workspace</span><strong>{module === "library" ? "Library" : module === "transport" ? "Transport" : module === "feeding" ? "Feeding" : module === "inventory" ? "Assets" : "Hiring"}</strong><small>Operational area</small></div>
        <div className="ops-kpi"><span>Status</span><strong>Live</strong><small>Connected to school data</small></div>
      </section>

      <section className="ops-main-grid">
        <div className="ops-workspace">
          {module === "library" && <div className="library-grid">{records.map(row => <article className="book-card" key={getText(row.id)}><div className="book-cover">{row.coverUrl ? <img src={String(row.coverUrl)} alt="" /> : <div><small>{getText(row.materialType, "book").toUpperCase()}</small><strong>{titleFor(row).slice(0, 2).toUpperCase()}</strong></div>}</div><div className="book-body"><span className="book-category">{getText(row.category)}</span><h3>{titleFor(row)}</h3><p>{getText(row.author, "School resource")}</p><div className="book-meta"><span>{getNumber(row.availableCopies)} available</span><span>{row.fileUrl ? "Digital" : `${getNumber(row.copies)} copies`}</span></div>{row.fileUrl && <div className="book-actions"><a className="ops-link" href={String(row.fileUrl)} target="_blank" rel="noreferrer">Read</a><a className="ops-link secondary" href={String(row.fileUrl)} download>Download</a></div>}</div></article>)}</div>}
          {module === "transport" && <div className="ops-list">{records.map(row => <article className="ops-list-row" key={getText(row.id)}><div><span>VEHICLE</span><h3>{titleFor(row)}</h3><p>{getText(row.registrationNumber)} · {getNumber(row.capacity)} seats</p></div><strong>{getText(row.status, "active")}</strong></article>)}</div>}
          {module === "feeding" && <div className="ops-list">{records.map(row => <article className="ops-list-row" key={getText(row.id)}><div><span>MENU</span><h3>{getText(row.meal, "Meal plan")}</h3><p>{getText(row.menuDate)} · {formatMoney(row.plannedCost)}</p></div><strong>{getText(row.status, "planned")}</strong></article>)}</div>}
          {module === "inventory" && <div className="inventory-table"><table><thead><tr><th>Asset</th><th>Tag</th><th>Location</th><th>Condition</th><th>Cost</th></tr></thead><tbody>{records.map(row => <tr key={getText(row.id)}><td><strong>{getText(row.name)}</strong><small>{getText(row.category)}</small></td><td>{getText(row.assetTag)}</td><td>{getText(row.location)}</td><td>{getText(row.condition)}</td><td>{formatMoney(row.purchaseCost)}</td></tr>)}</tbody></table></div>}
          {module === "recruitment" && <div className="ops-list">{records.map(row => <article className="ops-list-row" key={getText(row.id)}><div><span>{getText(row.department, "School")}</span><h3>{getText(row.title)}</h3><p>{getText(row.employmentType)} · {getText(row.closingDate, "Open")}</p></div><div><strong>{getText(row.status, "open")}</strong><small>{row.publicToken ? "Public application link ready" : "Draft"}</small></div></article>)}</div>}
          {records.length === 0 && <div className="ops-empty"><strong>No records yet.</strong><span>Use the workflow action to start this workspace.</span></div>}
        </div>
        <aside className="ops-create-card"><span className="ops-eyebrow">WORKFLOW</span><h2>{meta.action}</h2><p>Use the dedicated workflow controls for this school operation.</p><div className="ops-workflow-note">Connected to the SukuuNova data and permission layer. The workspace is ready for the corresponding operational workflow.</div></aside>
      </section>
    </main>
  );
}
