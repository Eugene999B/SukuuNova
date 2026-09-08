/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

type Day = { dayOfWeek: number; name: string; enabled: boolean };
type Block = { kind: "lesson" | "break"; period?: number; name: string; start: string; end: string };
type Slot = { dayOfWeek: number; period: number; subject: { name: string }; teacher: { name: string }; class: { name: string }; venue?: string | null };
type Room = { id: string; name: string; type?: string };
type Data = { school: { name: string; logoUrl?: string | null } | null; title: string; mode: "class" | "teacher"; days: Day[]; blocks: Block[]; slots: Slot[]; rooms: Room[] };

const fmt = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
};

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
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="quick-print-timetable">
      <div className="screen-print-actions"><button onClick={() => window.print()}><Printer size={16} /> Print / Save PDF</button></div>
      <header>{data.school?.logoUrl ? <img src={data.school.logoUrl} alt={`${data.school.name} logo`} /> : null}<div><small>SCHOOL TIMETABLE</small><h1>{data.school?.name ?? "School"}</h1><h2>{data.title}</h2></div></header>
      <table>
        <thead><tr><th>Time</th>{data.days.map((day) => <th key={day.dayOfWeek}>{day.name}</th>)}</tr></thead>
        <tbody>
          {data.blocks.map((block, blockIndex) => {
            if (block.kind === "break") {
              return <tr className="break-row" key={`break-${block.name}-${block.start}-${blockIndex}`}><th><strong>{block.name}</strong><span>{fmt(block.start)}–{fmt(block.end)}</span></th><td colSpan={data.days.length}>Break / non-teaching time</td></tr>;
            }
            const period = block.period;
            if (!period) return null;
            return <tr key={`period-${period}`}><th><strong>Period {period}</strong><span>{fmt(block.start)}–{fmt(block.end)}</span></th>{data.days.map((day) => {
              const slot = data.slots.find((item) => item.dayOfWeek === day.dayOfWeek && item.period === period);
              return <td key={`${day.dayOfWeek}:${period}`}>{slot ? <><strong>{slot.subject.name}</strong><span>{data.mode === "class" ? slot.teacher.name : slot.class.name}</span>{slot.venue ? <small>{venueLabel(slot.venue, data.rooms)}</small> : null}</> : <span>—</span>}</td>;
            })}</tr>;
          })}
        </tbody>
      </table>
      <style jsx>{`
        main{min-height:100vh;background:var(--color-text-on-brand);color:var(--color-brand-deep);padding:28px}
        .screen-print-actions{display:flex;justify-content:flex-end;margin-bottom:18px}
        .screen-print-actions button{display:flex;gap:7px;align-items:center;padding:9px 13px;border:0;border-radius:9px;background:var(--color-brand-deep);color:var(--color-text-on-brand);font-weight:700}
        header{display:flex;gap:16px;align-items:center;max-width:1200px;margin:0 auto 20px;border-bottom:3px solid var(--color-brand-deep);padding-bottom:14px}
        header img{width:58px;height:58px;object-fit:contain}
        header small{font-size:10px;letter-spacing:.14em;font-weight:800;color:var(--color-brand-deep);opacity:.72}
        h1{margin:3px 0;font-size:25px}
        h2{margin:0;font-size:19px}
        table{width:100%;max-width:1200px;margin:0 auto;border-collapse:collapse;table-layout:fixed;font-size:11px}
        th,td{border:1px solid var(--color-border-strong);padding:7px;text-align:left;vertical-align:top}
        thead th{background:var(--color-surface-soft)}
        tbody>tr>th{width:120px;background:var(--color-bg)}
        tbody th span,td span,td small{display:block;margin-top:3px;color:var(--color-brand-deep);opacity:.74}
        td{height:58px}
        .break-row th,.break-row td{height:auto;background:var(--color-warning-soft);color:var(--color-warning)}
        .break-row td{text-align:center;vertical-align:middle;font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:800}
        @media print{main{padding:8mm}.screen-print-actions{display:none}header{margin-bottom:6mm}table{font-size:9px}th,td{padding:5px}td{height:15mm}.break-row td{height:auto}@page{size:A4 landscape;margin:8mm}}
      `}</style>
    </main>
  );
}
