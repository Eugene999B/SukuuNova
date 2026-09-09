/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookHeart, BookOpen, BookmarkCheck, Download, Heart, LibraryBig, LockKeyhole, Search, Sparkles } from "lucide-react";

type Row = Record<string, unknown>;
const text = (value: unknown, fallback = "—") => typeof value === "string" && value.trim() ? value : fallback;
const number = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object") : [];
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) { const data = object(body); throw new Error(text(data.message, text(data.error, "Library request failed."))); }
  return object(body);
}

export default function GuardianLibraryHub() {
  const mutation = useRef(false);
  const [data, setData] = useState<Row>({});
  const [studentId, setStudentId] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("discover");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (requested?: string) => {
    try {
      setError("");
      const next = await api(`/api/guardian/library${requested ? `?studentId=${encodeURIComponent(requested)}` : ""}`);
      setData(next);
      const selected = object(next.selected);
      if (selected.id) setStudentId(text(selected.id, ""));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Library could not be loaded."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: Row, message: string) => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/guardian/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setNotice(message); await load(studentId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Action failed."); }
    finally { mutation.current = false; setBusy(false); }
  };

  const children = rows(data.children), books = rows(data.books), progress = rows(data.progress), favourites = rows(data.favourites), reservations = rows(data.reservations), loans = rows(data.loans), assignments = rows(data.assignments);
  const selected = object(data.selected);
  const progressByBook = useMemo(() => new Map(progress.map(item => [text(item.bookId), item])), [progress]);
  const favouriteIds = useMemo(() => new Set(favourites.map(item => text(item.bookId))), [favourites]);
  const reservationIds = useMemo(() => new Set(reservations.map(item => text(item.bookId))), [reservations]);
  const assignmentByBook = useMemo(() => new Map(assignments.map(item => [text(item.bookId), item])), [assignments]);
  const q = query.trim().toLowerCase();
  const filtered = books.filter(book => !q || [book.title, book.author, book.category, book.materialType, JSON.stringify(book.tags)].some(value => String(value ?? "").toLowerCase().includes(q)));
  const continueBooks = filtered.filter(book => { const item = progressByBook.get(text(book.id)); const pct = number(item?.progressPercent); return pct > 0 && pct < 100; });
  const shelfBooks = filtered.filter(book => favouriteIds.has(text(book.id)) || assignmentByBook.has(text(book.id)));
  const visibleBooks = tab === "continue" ? continueBooks : tab === "shelf" ? shelfBooks : filtered;

  return <div className="grid gap-5">
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-300/[0.08] via-white/[0.035] to-emerald-300/[0.08] p-5 md:p-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-3xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-emerald-200"><LibraryBig size={14}/> My Library</div><h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">Read, continue and discover</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Digital books open inside SukuuNova. Your school decides which resources may be downloaded; protected titles stay read-only while your reading progress and bookmarks remain saved.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Resources",books.length],["Continue",continueBooks.length],["My shelf",shelfBooks.length],["Loans",loans.filter(item=>text(item.status)==="borrowed").length]].map(([label,value])=><div key={label} className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3"><strong className="block text-xl font-black text-white">{value}</strong><span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</span></div>)}</div></div></section>

    {(error||notice)&&<div className={`rounded-xl border px-4 py-3 text-xs font-bold ${error?"border-red-300/20 bg-red-300/[0.06] text-red-200":"border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200"}`}>{error||notice}</div>}

    <section className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[220px_1fr_auto]"><label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500"><span>Learner</span><select value={studentId} onChange={event=>{const next=event.target.value;setStudentId(next);setData(current=>({...current,selected:null,books:[],progress:[],favourites:[],assignments:[],loans:[],reservations:[]}));void load(next);}} className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm normal-case tracking-normal text-white">{children.map(child=><option key={text(child.id)} value={text(child.id)}>{text(child.name)} · {text(child.className,"Unassigned")}</option>)}</select></label><div className="relative self-end"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search titles, authors, subjects and tags…" className="w-full rounded-xl border border-white/10 bg-slate-950/40 py-3 pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/40"/></div><div className="flex gap-2 self-end overflow-x-auto">{[["discover","Discover"],["continue","Continue"],["shelf","My shelf"]].map(([key,label])=><button key={key} onClick={()=>setTab(key)} className={`whitespace-nowrap rounded-xl px-3 py-2.5 text-[10px] font-black ${tab===key?"bg-white text-slate-950":"border border-white/10 text-slate-400"}`}>{label}</button>)}</div></section>

    {selected.id && assignments.length>0 && <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4"><div className="flex items-start gap-3"><Sparkles size={18} className="mt-0.5 text-amber-200"/><div><strong className="text-sm text-white">Recommended for {text(selected.name)}</strong><p className="mt-1 text-[10px] leading-5 text-slate-500">Required, recommended and reference resources chosen by the school.</p></div></div><div className="mt-3 flex flex-wrap gap-2">{assignments.slice(0,8).map(item=><span key={text(item.id)} className="rounded-full border border-white/10 bg-slate-950/30 px-3 py-1.5 text-[9px] font-bold text-slate-300">{text(item.kind)} · {text(item.bookTitle)}</span>)}</div></section>}

    {visibleBooks.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleBooks.map(book=>{
      const id=text(book.id), item=progressByBook.get(id), pct=Math.max(0,Math.min(100,number(item?.progressPercent))), favourite=favouriteIds.has(id), reserved=reservationIds.has(id), assigned=assignmentByBook.get(id), digital=Boolean(book.digitalAvailable), downloadable=Boolean(book.downloadAllowed);
      return <article key={id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]"><div className="flex h-48 items-center justify-center overflow-hidden bg-white/[0.025]">{text(book.coverUrl,"")?<img src={text(book.coverUrl)} alt="" className="h-full w-full object-cover"/>:<div className="text-center"><BookOpen size={34} className="mx-auto text-emerald-200"/><strong className="mt-3 block max-w-48 text-lg font-black text-white">{text(book.title)}</strong></div>}</div><div className="p-4"><div className="flex flex-wrap gap-1.5"><span className="rounded-full border border-white/10 px-2 py-1 text-[8px] font-black uppercase text-slate-400">{text(book.category,"General")}</span>{assigned&&<span className="rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-2 py-1 text-[8px] font-black uppercase text-amber-200">{text(assigned.kind)}</span>}{digital&&<span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-2 py-1 text-[8px] font-black uppercase text-emerald-200">{downloadable?"Read + download":"Read only"}</span>}</div><h2 className="mt-3 text-base font-black text-white">{text(book.title)}</h2><p className="mt-1 text-xs text-slate-500">{text(book.author,"School resource")}</p>{text(book.description,"")&&<p className="mt-3 line-clamp-3 text-[11px] leading-5 text-slate-400">{text(book.description)}</p>}{pct>0&&<div className="mt-4"><div className="mb-1 flex justify-between text-[9px] font-bold text-slate-500"><span>{pct>=100?"Completed":"Reading progress"}</span><span>{Math.round(pct)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-emerald-300" style={{width:`${pct}%`}}/></div></div>}<div className="mt-4 flex items-center justify-between text-[9px] text-slate-500"><span>{number(book.availableCopies)} physical copies</span>{number(book.estimatedMinutes)>0&&<span>~{number(book.estimatedMinutes)} min</span>}</div><div className="mt-4 flex flex-wrap gap-2">{digital&&<Link href={`/guardian/library/${encodeURIComponent(id)}/read?studentId=${encodeURIComponent(studentId)}`} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-3 py-2 text-[10px] font-black text-slate-950"><BookOpen size={14}/> {pct>0&&pct<100?"Continue reading":"Read"}</Link>}{downloadable&&<a href={`/api/guardian/library/content/${encodeURIComponent(id)}?studentId=${encodeURIComponent(studentId)}&download=1`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black text-slate-300"><Download size={14}/> Download</a>}{digital&&!downloadable&&<span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[9px] font-bold text-slate-500"><LockKeyhole size={13}/> Protected</span>}<button disabled={busy} onClick={()=>void post({action:"favourite",studentId,bookId:id,enabled:!favourite},favourite?"Removed from My shelf.":"Added to My shelf.")} className={`grid h-9 w-9 place-items-center rounded-xl border ${favourite?"border-pink-300/20 bg-pink-300/[0.08] text-pink-200":"border-white/10 text-slate-500"}`} aria-label={favourite?"Remove favourite":"Add favourite"}><Heart size={14} fill={favourite?"currentColor":"none"}/></button>{!digital&&number(book.availableCopies)<1&&!reserved&&<button disabled={busy} onClick={()=>void post({action:"reserve",studentId,bookId:id},"Reservation added to the library queue.")} className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black text-slate-300">Reserve</button>}{reserved&&<span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/15 px-3 py-2 text-[9px] font-bold text-amber-200"><BookmarkCheck size={13}/> Reserved</span>}</div></div></article>;
    })}</div>:<section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center"><BookHeart className="mx-auto text-slate-600"/><strong className="mt-3 block text-sm text-white">Nothing here yet</strong><p className="mt-1 text-xs text-slate-500">Try another tab or search, or ask the school library to add more resources.</p></section>}

    {(loans.length>0||reservations.length>0)&&<section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><h2 className="text-sm font-black text-white">Physical loans</h2><div className="mt-3 grid gap-2">{loans.slice(0,8).map(item=><div key={text(item.id)} className="rounded-xl border border-white/10 bg-slate-950/30 p-3"><strong className="text-xs text-white">{text(item.bookTitle)}</strong><span className="mt-1 block text-[9px] text-slate-500">{text(item.displayStatus,text(item.status))}</span></div>)}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><h2 className="text-sm font-black text-white">Reservations</h2><div className="mt-3 grid gap-2">{reservations.slice(0,8).map(item=><div key={text(item.id)} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/30 p-3"><div><strong className="text-xs text-white">{text(item.bookTitle)}</strong><span className="mt-1 block text-[9px] text-slate-500">{text(item.status)}</span></div><button disabled={busy} onClick={()=>void post({action:"cancelReservation",studentId,bookId:item.bookId,reservationId:item.id},"Reservation cancelled.")} className="text-[9px] font-black text-slate-500 hover:text-white">Cancel</button></div>)}</div></div></section>}
  </div>;
}
