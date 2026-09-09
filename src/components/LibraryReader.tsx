"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, BookmarkPlus, CheckCircle2, Download, Expand, Minimize2, Moon, Save, Sun } from "lucide-react";

type Bookmark = { id?: string; position?: string; label?: string | null; note?: string | null };
type Props = {
  title: string;
  author?: string | null;
  contentUrl: string;
  downloadUrl?: string | null;
  backHref: string;
  bookId?: string;
  studentId?: string;
  progressPercent?: number;
  bookmarks?: Bookmark[];
  progressEndpoint?: string;
};

export default function LibraryReader({ title, author, contentUrl, downloadUrl, backHref, bookId, studentId, progressPercent = 0, bookmarks = [], progressEndpoint }: Props) {
  const [focus, setFocus] = useState(false);
  const [night, setNight] = useState(false);
  const [progress, setProgress] = useState(Math.max(0, Math.min(100, progressPercent)));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const readerUrl = useMemo(() => `${contentUrl}${contentUrl.includes("#") ? "&" : "#"}toolbar=0&navpanes=0&scrollbar=1`, [contentUrl]);
  const canTrack = Boolean(progressEndpoint && bookId && studentId);

  const post = async (body: Record<string, unknown>) => {
    if (!progressEndpoint || busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(progressEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not save reading state.");
      setNotice("Saved.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not save reading state."); }
    finally { setBusy(false); }
  };

  const saveProgress = () => canTrack ? post({ action: "progress", studentId, bookId, progressPercent: progress, lastPosition: `progress:${progress}` }) : Promise.resolve();
  const addBookmark = async () => {
    if (!canTrack) return;
    await post({ action: "bookmark", studentId, bookId, position: `progress:${progress}`, label: `${progress}%`, note });
    setNote("");
  };

  return <div className={`${focus ? "fixed inset-0 z-[100] p-3 md:p-5" : "relative"} ${night ? "bg-slate-950" : "bg-slate-100"}`}>
    <section className={`mx-auto grid h-full max-w-[1500px] overflow-hidden rounded-2xl border ${night ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950"}`}>
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${night ? "border-white/10" : "border-slate-200"}`}>
        <div className="flex min-w-0 items-center gap-3"><Link href={backHref} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${night ? "border-white/10 text-slate-300" : "border-slate-200 text-slate-600"}`} aria-label="Back to library"><ArrowLeft size={17}/></Link><div className="min-w-0"><strong className="block truncate text-sm font-black">{title}</strong>{author ? <span className={`block truncate text-[10px] ${night ? "text-slate-500" : "text-slate-500"}`}>{author}</span> : null}</div></div>
        <div className="flex flex-wrap items-center gap-2"><button onClick={()=>setNight(value=>!value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black ${night ? "border-white/10 text-slate-300" : "border-slate-200 text-slate-600"}`}>{night?<Sun size={14}/>:<Moon size={14}/>} {night?"Light":"Night"}</button><button onClick={()=>setFocus(value=>!value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black ${night ? "border-white/10 text-slate-300" : "border-slate-200 text-slate-600"}`}>{focus?<Minimize2 size={14}/>:<Expand size={14}/>} {focus?"Exit focus":"Focus"}</button>{downloadUrl?<a href={downloadUrl} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-3 py-2 text-[10px] font-black text-slate-950"><Download size={14}/> Download allowed</a>:<span className={`rounded-xl border px-3 py-2 text-[9px] font-bold ${night?"border-white/10 text-slate-500":"border-slate-200 text-slate-500"}`}>Protected read-only access</span>}</div>
      </header>

      <div className={`grid min-h-[72vh] ${canTrack ? "lg:grid-cols-[minmax(0,1fr)_280px]" : ""}`}>
        <div className={`${night ? "bg-slate-900" : "bg-slate-200"} min-h-[70vh] p-2 md:p-3`}><iframe title={`Read ${title}`} src={readerUrl} className="h-full min-h-[70vh] w-full rounded-xl bg-white" sandbox="allow-same-origin" referrerPolicy="no-referrer" /></div>
        {canTrack ? <aside className={`border-l p-4 ${night ? "border-white/10 bg-slate-950" : "border-slate-200 bg-white"}`}><div><div className="flex items-center justify-between"><strong className="text-xs font-black">Reading progress</strong><span className="text-xs font-black text-emerald-500">{Math.round(progress)}%</span></div><input aria-label="Reading progress" type="range" min="0" max="100" step="1" value={progress} onChange={event=>setProgress(Number(event.target.value))} className="mt-3 w-full accent-emerald-400"/><button disabled={busy} onClick={()=>void saveProgress()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-3 py-2.5 text-[10px] font-black text-slate-950 disabled:opacity-50"><Save size={14}/> Save progress</button>{progress>=100?<div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-300/[0.08] p-3 text-[10px] font-bold text-emerald-500"><CheckCircle2 size={15}/> Marked complete</div>:null}</div><div className={`my-5 border-t ${night?"border-white/10":"border-slate-200"}`}/><div><strong className="text-xs font-black">Bookmark this point</strong><textarea value={note} onChange={event=>setNote(event.target.value)} rows={3} placeholder="Optional note…" className={`mt-2 w-full resize-none rounded-xl border px-3 py-2 text-xs outline-none ${night?"border-white/10 bg-white/[0.04] text-white placeholder:text-slate-600":"border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"}`}/><button disabled={busy} onClick={()=>void addBookmark()} className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[10px] font-black ${night?"border-white/10 text-slate-300":"border-slate-200 text-slate-600"}`}><BookmarkPlus size={14}/> Add bookmark</button></div>{bookmarks.length?<div className="mt-5"><strong className="text-xs font-black">Saved bookmarks</strong><div className="mt-2 grid gap-2">{bookmarks.slice(0,8).map((bookmark,index)=><div key={bookmark.id ?? `${bookmark.position}-${index}`} className={`rounded-xl border p-2.5 ${night?"border-white/10 bg-white/[0.025]":"border-slate-200 bg-slate-50"}`}><span className="text-[10px] font-black">{bookmark.label || bookmark.position || "Bookmark"}</span>{bookmark.note?<p className="mt-1 text-[9px] leading-4 text-slate-500">{bookmark.note}</p>:null}</div>)}</div></div>:null}{notice?<p className="mt-4 text-[10px] font-bold text-emerald-500">{notice}</p>:null}</aside> : null}
      </div>
    </section>
  </div>;
}
