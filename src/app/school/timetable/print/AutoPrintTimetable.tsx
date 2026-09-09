/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo } from "react";
import { Printer } from "lucide-react";

type Day = { dayOfWeek: number; name: string; enabled: boolean };
type Block = { kind: "lesson" | "break"; period?: number; name: string; start: string; end: string };
type Slot = { dayOfWeek: number; period: number; subject: { name: string }; teacher: { name: string }; class: { name: string }; venue?: string | null };
type Room = { id: string; name: string; type?: string };
type PrintTheme = "ghana_classic" | "modern_blue" | "heritage_green" | "minimal_mono";
type Data = {
  school: { name: string; uniqueCode: string; logoUrl?: string | null } | null;
  title: string;
  mode: "class" | "teacher";
  days: Day[];
  blocksByDay: Record<number, Block[]>;
  slots: Slot[];
  rooms: Room[];
  printTheme: PrintTheme;
};
type PrintColumn =
  | { kind: "lesson"; period: number; sortStart: number; label: string }
  | { kind: "break"; name: string; start: string; end: string; sortStart: number };

const themeNames: Record<PrintTheme, string> = {
  ghana_classic: "Ghana Classic",
  modern_blue: "Modern Blue",
  heritage_green: "Heritage Green",
  minimal_mono: "Minimal Mono",
};

const minutes = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};
const fmt = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
};
const blockTime = (block: Pick<Block, "start" | "end">) => `${fmt(block.start)}–${fmt(block.end)}`;

function venueLabel(value: string | null | undefined, rooms: Room[]) {
  if (!value) return "";
  if (value.startsWith("room:")) {
    const id = value.slice(5);
    return rooms.find((room) => room.id === id)?.name ?? id;
  }
  if (value.startsWith("type:")) return value.slice(5).replaceAll("_", " ");
  return value;
}

export default function AutoPrintTimetable({ data }: { data: Data }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, []);

  const columns = useMemo<PrintColumn[]>(() => {
    const periods = new Set<number>();
    const breakMap = new Map<string, Extract<PrintColumn, { kind: "break" }>>();
    for (const day of data.days) {
      for (const block of data.blocksByDay[day.dayOfWeek] ?? []) {
        if (block.kind === "lesson" && block.period) periods.add(block.period);
        if (block.kind === "break") {
          const key = `${block.name}:${block.start}:${block.end}`;
          if (!breakMap.has(key)) breakMap.set(key, { kind: "break", name: block.name, start: block.start, end: block.end, sortStart: minutes(block.start) });
        }
      }
    }
    for (const slot of data.slots) periods.add(slot.period);

    const lessonColumns: PrintColumn[] = [...periods].sort((a, b) => a - b).map((period) => {
      const blocks = data.days.flatMap((day) => {
        const block = (data.blocksByDay[day.dayOfWeek] ?? []).find((item) => item.kind === "lesson" && item.period === period);
        return block ? [block] : [];
      });
      const uniqueTimes = [...new Set(blocks.map(blockTime))];
      return {
        kind: "lesson" as const,
        period,
        sortStart: blocks.length ? Math.min(...blocks.map((block) => minutes(block.start))) : Number.MAX_SAFE_INTEGER,
        label: uniqueTimes.length === 1 ? uniqueTimes[0] : uniqueTimes.length ? "Time varies by day" : "Outside schedule",
      };
    });
    return [...lessonColumns, ...breakMap.values()].sort((a, b) => a.sortStart - b.sortStart || (a.kind === "lesson" ? -1 : 1));
  }, [data.blocksByDay, data.days, data.slots]);

  const theme = data.printTheme || "ghana_classic";
  return (
    <main className={`official-timetable-print theme-${theme}`}>
      <div className="print-toolbar">
        <div><strong>{data.title}</strong><span>{themeNames[theme]} · Landscape print</span></div>
        <button onClick={() => window.print()}><Printer size={16} /> Print / Save PDF</button>
      </div>

      <article className="timetable-paper">
        <header className="print-head">
          <div className="print-logo">
            {data.school?.logoUrl ? <img src={data.school.logoUrl} alt={`${data.school.name} logo`} /> : <span>{data.school?.name?.slice(0, 2).toUpperCase() || "SN"}</span>}
          </div>
          <div className="print-identity">
            <small>OFFICIAL SCHOOL TIMETABLE</small>
            <h1>{data.school?.name ?? "School"}</h1>
            <div className="identity-rule"><i /><b /><i /></div>
            <h2>{data.title}</h2>
            <p>{data.mode === "class" ? "Weekly class teaching schedule" : "Weekly teacher teaching schedule"}</p>
          </div>
          <div className="print-code"><span>School code</span><strong>{data.school?.uniqueCode ?? "—"}</strong><small>{themeNames[theme]}</small></div>
        </header>

        <div className="table-frame">
          <table className="ghana-table">
            <thead>
              <tr>
                <th className="day-title"><strong>DAY</strong></th>
                {columns.map((column, index) => column.kind === "break"
                  ? <th className="break-title" key={`break-${column.name}-${index}`}><strong>{column.name}</strong><span>{fmt(column.start)}–{fmt(column.end)}</span></th>
                  : <th key={`period-${column.period}-${index}`}><strong>Period {column.period}</strong><span>{column.label}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {data.days.map((day) => (
                <tr key={day.dayOfWeek}>
                  <th className="day-name"><strong>{day.name}</strong></th>
                  {columns.map((column, index) => {
                    if (column.kind === "break") return <td className="break-column" key={`break-${day.dayOfWeek}-${index}`}><strong>{column.name}</strong></td>;
                    const block = (data.blocksByDay[day.dayOfWeek] ?? []).find((item) => item.kind === "lesson" && item.period === column.period);
                    const slot = data.slots.find((item) => item.dayOfWeek === day.dayOfWeek && item.period === column.period);
                    if (!block && !slot) return <td className="not-used" key={`${day.dayOfWeek}:${column.period}`}><span>—</span></td>;
                    return (
                      <td className={!block && slot ? "outside-schedule" : ""} key={`${day.dayOfWeek}:${column.period}`}>
                        {block && column.label !== blockTime(block) ? <small className="actual-time">{blockTime(block)}</small> : null}
                        {slot ? <><strong>{slot.subject.name}</strong><span>{data.mode === "class" ? slot.teacher.name : slot.class.name}</span>{slot.venue ? <small>{venueLabel(slot.venue, data.rooms)}</small> : null}</> : <span>—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer><span>Generated through SukuuNova</span><strong>{data.title}</strong><span>Official weekly timetable</span></footer>
      </article>

      <style jsx>{`
        @page{size:A4 landscape;margin:7mm}
        .official-timetable-print{--tt-paper:Canvas;--tt-ink:CanvasText;--tt-accent:var(--color-brand-deep);--tt-accent-soft:color-mix(in srgb,var(--tt-accent) 9%,var(--tt-paper));--tt-line:color-mix(in srgb,var(--tt-ink) 35%,var(--tt-paper));--tt-line-soft:color-mix(in srgb,var(--tt-ink) 16%,var(--tt-paper));--tt-break:var(--color-warning-soft);color-scheme:light;min-height:100vh;padding:22px;background:var(--color-bg);font-family:var(--sn-font-family);color:var(--tt-ink)}
        .theme-modern_blue{--tt-accent:var(--color-info)}
        .theme-heritage_green{--tt-accent:var(--color-success)}
        .theme-minimal_mono{--tt-accent:var(--tt-ink);--tt-accent-soft:var(--tt-paper);--tt-break:color-mix(in srgb,var(--tt-ink) 6%,var(--tt-paper))}
        .print-toolbar{max-width:1280px;margin:0 auto 14px;display:flex;justify-content:space-between;gap:16px;align-items:center;padding:11px 13px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface)}
        .print-toolbar strong{display:block;font-size:11px;color:var(--color-text-primary)}.print-toolbar span{display:block;margin-top:2px;font-size:8px;color:var(--color-text-muted)}
        .print-toolbar button{display:flex;align-items:center;gap:6px;border:0;border-radius:9px;background:var(--color-brand);color:var(--color-text-on-brand);padding:9px 12px;font:800 9px var(--sn-font-family);cursor:pointer}
        .timetable-paper{box-sizing:border-box;width:min(100%,1280px);min-height:190mm;margin:0 auto;padding:9mm;background:var(--tt-paper);color:var(--tt-ink);border:1px solid var(--tt-line);box-shadow:0 22px 60px var(--shadow-md);-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .timetable-paper,.timetable-paper *{box-sizing:border-box}
        .print-head{display:grid;grid-template-columns:90px minmax(0,1fr) 135px;gap:16px;align-items:center;padding-bottom:12px;margin-bottom:13px;border-bottom:3px double var(--tt-accent)}
        .print-logo{width:82px;height:82px;display:grid;place-items:center;overflow:hidden;border:2px solid var(--tt-accent);border-radius:50%;background:var(--tt-paper);padding:6px}.print-logo img{width:100%;height:100%;object-fit:contain}.print-logo span{font-size:22px;font-weight:950;color:var(--tt-accent)}
        .print-identity{text-align:center}.print-identity>small{font-size:7px;font-weight:950;letter-spacing:.2em;color:var(--tt-accent)}.print-identity h1{margin:4px 0 2px;font-size:24px;line-height:1.05;text-transform:uppercase;letter-spacing:.015em}.print-identity h2{margin:4px 0 2px;font-size:14px}.print-identity p{margin:0;font-size:7px;text-transform:uppercase;letter-spacing:.08em;color:color-mix(in srgb,var(--tt-ink) 62%,var(--tt-paper))}
        .identity-rule{width:130px;margin:5px auto;display:grid;grid-template-columns:1fr 6px 1fr;gap:4px;align-items:center}.identity-rule i{height:1px;background:var(--tt-accent)}.identity-rule b{width:6px;height:6px;background:var(--tt-accent);transform:rotate(45deg)}
        .print-code{justify-self:end;text-align:right}.print-code span,.print-code small{display:block;font-size:7px;color:color-mix(in srgb,var(--tt-ink) 58%,var(--tt-paper))}.print-code strong{display:block;margin:4px 0;font-size:10px;color:var(--tt-accent)}
        .table-frame{overflow:hidden;border:2px solid var(--tt-line)}.ghana-table{width:100%;border-collapse:collapse;table-layout:fixed}.ghana-table th,.ghana-table td{border-right:1px solid var(--tt-line);border-bottom:1px solid var(--tt-line);text-align:center;vertical-align:middle}.ghana-table tr:last-child th,.ghana-table tr:last-child td{border-bottom:0}.ghana-table th:last-child,.ghana-table td:last-child{border-right:0}
        .ghana-table thead th{height:18mm;padding:4px;background:var(--tt-accent-soft)}.ghana-table thead strong{display:block;font-size:7px;text-transform:uppercase;letter-spacing:.04em}.ghana-table thead span{display:block;margin-top:3px;font-size:6px;line-height:1.25;color:color-mix(in srgb,var(--tt-ink) 62%,var(--tt-paper))}.ghana-table .day-title{width:25mm;background:var(--tt-accent);color:var(--tt-paper)}
        .ghana-table .day-name{width:25mm;padding:5px;background:var(--tt-accent-soft)}.ghana-table .day-name strong{font-size:8px;text-transform:uppercase;letter-spacing:.06em}
        .ghana-table tbody td{height:23mm;padding:5px;background:var(--tt-paper)}.ghana-table tbody td>strong{display:block;font-size:8px;line-height:1.2;color:var(--tt-accent)}.ghana-table tbody td>span{display:block;margin-top:3px;font-size:7px;line-height:1.2}.ghana-table tbody td>small{display:block;margin-top:2px;font-size:6px;color:color-mix(in srgb,var(--tt-ink) 58%,var(--tt-paper))}
        .ghana-table .break-title{width:16mm;background:var(--tt-break)}.ghana-table .break-column{width:16mm;background:var(--tt-break)}.ghana-table .break-column strong{display:block;writing-mode:vertical-rl;transform:rotate(180deg);margin:auto;font-size:7px;text-transform:uppercase;letter-spacing:.1em}.ghana-table .not-used{background:color-mix(in srgb,var(--tt-ink) 4%,var(--tt-paper))}.ghana-table .not-used span{margin:0;color:color-mix(in srgb,var(--tt-ink) 35%,var(--tt-paper))}.ghana-table .outside-schedule{box-shadow:inset 0 0 0 2px var(--color-warning)}.actual-time{font-weight:850;color:var(--tt-accent)!important}
        .theme-modern_blue .print-head{border-bottom-style:solid}.theme-modern_blue .print-logo{border-radius:14px}.theme-modern_blue .ghana-table .day-title,.theme-modern_blue .ghana-table .day-name{background:var(--tt-accent);color:var(--tt-paper)}
        .theme-heritage_green .timetable-paper{border:3px double var(--tt-accent)}.theme-heritage_green .print-identity h1{font-family:Georgia,"Times New Roman",serif}.theme-heritage_green .ghana-table thead th{border-bottom:2px solid var(--tt-accent)}
        .theme-minimal_mono .print-head{border-bottom:2px solid var(--tt-ink)}.theme-minimal_mono .print-logo{border-radius:0}.theme-minimal_mono .identity-rule{display:none}.theme-minimal_mono .ghana-table .day-title{background:var(--tt-paper);color:var(--tt-ink);border-right:2px solid var(--tt-ink)}.theme-minimal_mono .ghana-table .day-name{background:var(--tt-paper);border-right:2px solid var(--tt-ink)}
        footer{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin-top:8px;padding-top:7px;border-top:1px solid var(--tt-line-soft);font-size:6px;color:color-mix(in srgb,var(--tt-ink) 55%,var(--tt-paper))}footer strong{text-align:center;font-size:7px;color:var(--tt-ink)}footer span:last-child{text-align:right}
        @media print{.official-timetable-print{min-height:0;padding:0;background:transparent}.print-toolbar{display:none}.timetable-paper{width:100%;min-height:0;margin:0;padding:5mm;border-color:var(--tt-line);box-shadow:none}.print-head{margin-bottom:4mm}.ghana-table thead th{height:15mm}.ghana-table tbody td{height:20mm}footer{margin-top:4mm}}
      `}</style>
    </main>
  );
}
