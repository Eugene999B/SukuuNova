"use client";

import { useEffect, useState } from "react";

type Year = { id: string; name: string; startDate: string; endDate: string; isLocked: boolean };
type Staff = { id: string; name: string; roles: string[] };
type Section = { id: string; academicYearId: string; classId: string; displayName: string; sectionCode: string; gradeName: string; pathwayName: string | null; classTeacherId: string | null; classTeacherName: string | null };
type Data = { years: Year[]; selectedYearId: string | null; sections: Section[]; staff: Staff[] };

export default function ClassTeacherAssignments() {
  const [data, setData] = useState<Data | null>(null);
  const [yearId, setYearId] = useState("");
  const [busySection, setBusySection] = useState("");
  const [message, setMessage] = useState("");

  const load = async (academicYearId = "") => {
    setMessage("");
    const params = new URLSearchParams();
    if (academicYearId) params.set("academicYearId", academicYearId);
    const response = await fetch(`/api/school/academic-structure/class-teachers?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error || "Unable to load class-teacher assignments.");
    setData(payload);
    setYearId(payload.selectedYearId ?? "");
  };
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load assignments.")); }, []);

  const assign = async (section: Section, userId: string) => {
    setBusySection(section.id); setMessage("");
    try {
      const response = await fetch("/api/school/academic-structure/class-teachers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ academicYearId: yearId, classSectionId: section.id, userId: userId || null }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Unable to assign class teacher.");
      setData(payload.data);
      setMessage(userId ? "Class teacher assignment saved for this academic year." : "Primary class teacher cleared for this academic year.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to assign class teacher."); }
    finally { setBusySection(""); }
  };

  return <main className="cta-page"><style>{styles}</style>
    <header className="cta-hero"><div><span>ACADEMIC YEAR RESPONSIBILITIES</span><h1>Class Teacher Assignments</h1><p>Choose the primary class teacher for each class section in each academic year. One teacher may lead more than one class, while historical years keep the teacher who was actually responsible then.</p></div><div className="cta-count"><small>Mapped sections</small><strong>{data?.sections.length ?? "—"}</strong></div></header>
    <section className="cta-toolbar"><label><span>Academic year</span><select value={yearId} onChange={(event) => { setYearId(event.target.value); void load(event.target.value).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load assignments.")); }}>{data?.years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isLocked ? " · Locked" : ""}</option>)}</select></label><div><strong>Annual, not permanent</strong><span>Changing 2027/28 does not rewrite the class teacher printed on an approved 2026/27 report.</span></div></section>
    {message ? <div className="cta-message" role="status">{message}</div> : null}
    <section className="cta-list"><div className="cta-head"><span>Class / Section</span><span>Grade / Pathway</span><span>Primary Class Teacher</span><span>Status</span></div>{data?.sections.map((section) => <div className="cta-row" key={section.id}><div><strong>{section.displayName}</strong><small>Section {section.sectionCode}</small></div><div><strong>{section.gradeName}</strong><small>{section.pathwayName ?? "General section"}</small></div><label><select value={section.classTeacherId ?? ""} disabled={busySection === section.id} onChange={(event) => void assign(section,event.target.value)}><option value="">No primary class teacher</option>{data.staff.map((person) => <option key={person.id} value={person.id}>{person.name}{person.roles.length ? ` · ${person.roles.join(", ")}` : ""}</option>)}</select></label><div className={section.classTeacherId ? "cta-status ready" : "cta-status missing"}>{section.classTeacherId ? "Assigned" : "Needs assignment"}</div></div>)}{data && !data.sections.length ? <div className="cta-empty">No active class sections are mapped for this academic year. Map classes in School Structure first.</div> : null}{!data ? <div className="cta-empty">Loading annual class-teacher assignments…</div> : null}</section>
  </main>;
}

const styles = `
.cta-page{max-width:1180px;margin:0 auto;padding:24px;display:grid;gap:14px;color:var(--color-text-primary)}.cta-hero{padding:22px 24px;border:1px solid var(--color-border);border-radius:20px;background:var(--color-surface);display:flex;justify-content:space-between;gap:20px}.cta-hero>div:first-child>span{font-size:9px;font-weight:900;letter-spacing:.14em;color:var(--color-text-muted)}.cta-hero h1{margin:5px 0;font-size:29px;letter-spacing:-.03em}.cta-hero p{max-width:790px;margin:0;font-size:12px;line-height:1.7;color:var(--color-text-secondary)}.cta-count{min-width:120px;border-left:1px solid var(--color-border);padding-left:18px;display:grid;align-content:center;gap:4px}.cta-count small{font-size:8px;text-transform:uppercase;color:var(--color-text-muted)}.cta-count strong{font-size:28px}.cta-toolbar{display:grid;grid-template-columns:280px 1fr;gap:16px;padding:15px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface)}.cta-toolbar label{display:grid;gap:5px}.cta-toolbar label span{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.09em;color:var(--color-text-muted)}.cta-toolbar select,.cta-row select{height:40px;border:1px solid var(--color-border);border-radius:9px;background:var(--color-bg);color:var(--color-text-primary);padding:0 10px;width:100%}.cta-toolbar>div{display:grid;align-content:center;gap:3px}.cta-toolbar>div strong{font-size:10px}.cta-toolbar>div span{font-size:9px;color:var(--color-text-secondary)}.cta-message{padding:12px 14px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);font-size:10px}.cta-list{border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);overflow:hidden}.cta-head,.cta-row{display:grid;grid-template-columns:1.1fr 1fr 1.5fr 120px;gap:12px;align-items:center;padding:11px 14px}.cta-head{background:var(--color-bg);border-bottom:1px solid var(--color-border)}.cta-head span{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.09em;color:var(--color-text-muted)}.cta-row{border-bottom:1px solid var(--color-border)}.cta-row>div:first-child,.cta-row>div:nth-child(2){display:grid;gap:3px}.cta-row strong{font-size:10px}.cta-row small{font-size:8px;color:var(--color-text-muted)}.cta-status{justify-self:start;border-radius:999px;padding:5px 8px;font-size:7px;font-weight:900;text-transform:uppercase}.cta-status.ready{color:var(--color-success);background:color-mix(in srgb,var(--color-success) 13%,transparent)}.cta-status.missing{color:var(--color-warning);background:color-mix(in srgb,var(--color-warning) 13%,transparent)}.cta-empty{padding:28px;text-align:center;color:var(--color-text-muted);font-size:10px}@media(max-width:820px){.cta-hero{flex-direction:column}.cta-count{border-left:0;border-top:1px solid var(--color-border);padding:10px 0 0}.cta-toolbar{grid-template-columns:1fr}.cta-head{display:none}.cta-row{grid-template-columns:1fr}.cta-status{justify-self:start}}
`;
