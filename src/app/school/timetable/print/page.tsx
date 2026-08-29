"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import "./print.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Slot = { id: string; classId: string; subjectId: string; teacherId: string; dayOfWeek: number; period: number; class: { name: string; level: string | null }; subject: { name: string }; teacher: { name: string } };
type Data = { slots: Slot[]; classes: { id: string; name: string; level: string | null }[]; subjects: { id: string; name: string }[]; teachers: { id: string; name: string }[]; school: { name: string; uniqueCode: string; logoUrl?: string | null } | null };

type ApiError = { error?: string; message?: string };

function esc(value: string) { return value.replace(/\\/g, "\\\\").replace(/[{}]/g, "\\$&").replace(/\\r?\\n/g, "\\par "); }
function safeName(value: string) { return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "timetable"; }
function download(name: string, content: string, type: string) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export default function TimetablePrintPage() {
  const [data, setData] = useState<Data | null>(null);
  const [view, setView] = useState<"class" | "teacher" | "master">("class");
  const [selectedId, setSelectedId] = useState("");
  const [template, setTemplate] = useState<"classic" | "modern" | "compact">("modern");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await fetch("/api/phase2/timetable", { cache: "no-store" });
        const json = await response.json() as Data & ApiError;
        if (!response.ok) throw new Error(json.error || json.message || "Unable to load timetable data.");
        if (!Array.isArray(json.slots) || !Array.isArray(json.classes) || !Array.isArray(json.subjects) || !Array.isArray(json.teachers)) {
          throw new Error("Timetable data is incomplete. Please refresh the page.");
        }
        if (mounted) setData(json);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unable to load timetable data.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const options = useMemo(() => view === "class" ? data?.classes ?? [] : view === "teacher" ? data?.teachers ?? [] : [], [data, view]);

  useEffect(() => {
    if (view === "master") { setSelectedId(""); return; }
    const stillValid = options.some((item) => item.id === selectedId);
    if (!stillValid) setSelectedId(options[0]?.id ?? "");
  }, [options, selectedId, view]);

  const filtered = useMemo(() => {
    const slots = data?.slots ?? [];
    if (view === "class") return selectedId ? slots.filter((s) => s.classId === selectedId) : [];
    if (view === "teacher") return selectedId ? slots.filter((s) => s.teacherId === selectedId) : [];
    return slots;
  }, [data, view, selectedId]);

  const title = view === "class" ? (data?.classes.find((x) => x.id === selectedId)?.name ?? "Class timetable") : view === "teacher" ? (data?.teachers.find((x) => x.id === selectedId)?.name ?? "Teacher timetable") : "Master timetable";
  const baseFile = `sukuunova-timetable-${safeName(title)}`;

  const csv = () => {
    const rows = [["Day", "Period", "Class", "Subject", "Teacher"], ...filtered.map((s) => [DAYS[s.dayOfWeek - 1] ?? `Day ${s.dayOfWeek}`, String(s.period), s.class.name, s.subject.name, s.teacher.name])];
    download(`${baseFile}.csv`, rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv;charset=utf-8");
  };

  const rtf = () => {
    const body = ["SukuuNova Timetable", data?.school?.name ?? "School", title, "", "Day\\tab Period\\tab Class\\tab Subject\\tab Teacher\\par", ...filtered.map((s) => `${DAYS[s.dayOfWeek - 1] ?? `Day ${s.dayOfWeek}`}\\tab ${s.period}\\tab ${s.class.name}\\tab ${s.subject.name}\\tab ${s.teacher.name}\\par`)].join("\\par ");
    download(`${baseFile}.rtf`, `{\\rtf1\\ansi\\deff0 ${esc(body)} }`, "application/rtf");
  };

  const html = () => {
    const cells = Array.from({ length: 10 }, (_, i) => i + 1).map((p) => `<tr><th>Period ${p}</th>${DAYS.map((_, d) => { const s = filtered.find((x) => x.dayOfWeek === d + 1 && x.period === p); return `<td>${s ? `<b>${s.subject.name}</b><br><span>${s.teacher.name}</span><br><small>${s.class.name}</small>` : ""}</td>`; }).join("")}</tr>`).join("");
    download(`${baseFile}.html`, `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial;padding:30px;color:#173b42}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aab8b9;padding:9px;text-align:center}th{background:#173b42;color:#fff}td{height:50px}small,span{color:#61777b}</style></head><body><h1>${data?.school?.name ?? "School"}</h1><h2>${title}</h2><table><thead><tr><th>Period</th>${DAYS.map(d => `<th>${d}</th>`).join("")}</tr></thead><tbody>${cells}</tbody></table></body></html>`, "text/html;charset=utf-8");
  };

  if (loading) return <AppShell universe="school" title="Timetable exports" subtitle="Prepare a timetable for printing or download." active="Timetable"><div className="export-loading">Loading timetable…</div></AppShell>;
  if (error || !data) return <AppShell universe="school" title="Timetable exports" subtitle="Prepare a timetable for printing or download." active="Timetable"><main className="export-page"><section className="export-error"><span className="export-eyebrow">TIMETABLE STUDIO</span><h1>We couldn't load the timetable.</h1><p>{error || "Timetable data is unavailable."}</p><div><button className="primary-action" type="button" onClick={() => window.location.reload()}>Reload timetable</button><Link href="/school/timetable" className="back-link">Back to timetable</Link></div></section></main></AppShell>;

  return <AppShell universe="school" title="Timetable exports" subtitle="Choose who the timetable is for, select a design, then print or download it." active="Timetable" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""}>
    <main className="export-page">
      <section className="export-hero"><div><span className="export-eyebrow">TIMETABLE STUDIO</span><h1>Make the timetable ready for anyone.</h1><p>Choose the audience, pick a presentation style, preview it, then print or download the exact view.</p></div><Link href="/school/timetable" className="back-link">← Back to timetable</Link></section>
      <section className="export-controls"><div className="control-group"><label>View</label><div className="segmented"><button type="button" className={view === "class" ? "active" : ""} onClick={() => setView("class")}>Class</button><button type="button" className={view === "teacher" ? "active" : ""} onClick={() => setView("teacher")}>Teacher</button><button type="button" className={view === "master" ? "active" : ""} onClick={() => setView("master")}>Master</button></div></div>{view !== "master" && <div className="control-group"><label>{view === "class" ? "Class" : "Teacher"}</label><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">Choose {view}</option>{options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}<div className="control-group"><label>Design</label><div className="template-picker"><button type="button" className={template === "modern" ? "selected" : ""} onClick={() => setTemplate("modern")}><b>Modern</b><span>Clean accent</span></button><button type="button" className={template === "classic" ? "selected" : ""} onClick={() => setTemplate("classic")}><b>Classic</b><span>Traditional school</span></button><button type="button" className={template === "compact" ? "selected" : ""} onClick={() => setTemplate("compact")}><b>Compact</b><span>More on one page</span></button></div></div></section>
      <section className={`preview-paper ${template}`} id="print-area"><header><div>{data.school?.logoUrl ? <img src={data.school.logoUrl} alt="School logo"/> : <div className="logo-placeholder">S</div>}</div><div><span>WEEKLY TIMETABLE</span><h2>{data.school?.name ?? "SukuuNova"}</h2><strong>{title}</strong><small>{data.school?.uniqueCode ?? ""}</small></div></header><div className="preview-meta"><span>{filtered.length} lessons</span><span>{template === "compact" ? "Compact layout" : template === "classic" ? "Classic layout" : "Modern layout"}</span></div><table><thead><tr><th>Period</th>{DAYS.map(d => <th key={d}>{d}</th>)}</tr></thead><tbody>{Array.from({ length: 10 }, (_, i) => i + 1).map((p) => <tr key={p}><th>{p}</th>{DAYS.map((_, d) => { const s = filtered.find((x) => x.dayOfWeek === d + 1 && x.period === p); return <td key={d}>{s ? <><b>{s.subject.name}</b><span>{s.teacher.name}</span>{view === "master" && <small>{s.class.name}</small>}</> : <em>—</em>}</td>; })}</tr>)}</tbody></table><footer><span>{title}</span><span>Generated by SukuuNova</span></footer></section>
      <section className="export-actions"><div><h3>Download or print</h3><p>Use PDF for distribution and paper, Word for editing, CSV for Excel/spreadsheets, or HTML for sharing and archiving.</p></div><div className="action-buttons"><button type="button" onClick={() => window.print()}>Print / Save PDF</button><button type="button" onClick={rtf}>Word (.rtf)</button><button type="button" onClick={csv}>Excel / CSV</button><button type="button" onClick={html}>HTML</button></div></section>
    </main>
  </AppShell>;
}
