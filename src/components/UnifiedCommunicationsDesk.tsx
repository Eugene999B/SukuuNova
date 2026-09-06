"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Paperclip, RefreshCw, Send, Check, Clock3, AlertTriangle, MessageSquare, Smartphone, Bell, Users, X } from "lucide-react";

type Person = { id: string; name: string; email?: string | null; phone?: string | null; roles?: string[]; isGuardian?: boolean };
type Attachment = { name: string; type: string; size: number; dataUrl: string };
type Message = { id: string; body: string; status: string; createdAt: string; sentAt?: string | null; lastError?: string | null; templateVariables?: unknown; mediaUrl?: string | null; channel?: string; recipientType?: string; recipientId?: string };
type Props = { schoolName: string; mode?: "all" | "external" };

const channelCopy = {
  in_app: { label: "SukuuNova inbox", detail: "Instant portal delivery with attachments and read status.", icon: Bell },
  sms: { label: "SMS", detail: "Reach the phone number on the school record.", icon: Smartphone },
  whatsapp: { label: "WhatsApp", detail: "Use the configured business sender and approved template.", icon: MessageSquare },
};

function safeMeta(v: unknown) { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; }
function displayDate(v: unknown) { const d = new Date(String(v || "")); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
function roleLabel(person: Person) { return person.roles?.slice(0, 2).join(" · ") || (person.isGuardian ? "Guardian" : "Staff"); }

export default function UnifiedCommunicationsDesk({ schoolName, mode = "all" }: Props) {
  const [tab, setTab] = useState<"compose" | "inbox" | "sent">("compose");
  const [channel, setChannel] = useState<"in_app" | "sms" | "whatsapp">("in_app");
  const [audience, setAudience] = useState<"individual" | "guardians" | "teachers" | "staff" | "all">("individual");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [data, setData] = useState<{ inbox: Message[]; sent: Message[]; unreadCount: number; recipients: Person[] }>({ inbox: [], sent: [], unreadCount: 0, recipients: [] });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/school/communications/unified", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (response.ok) setData(json);
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => { void load(); }, 15000); return () => window.clearInterval(timer); }, []);

  const counts = useMemo(() => ({
    guardians: data.recipients.filter((p) => p.isGuardian).length,
    teachers: data.recipients.filter((p) => p.roles?.some((r) => /teacher/i.test(r))).length,
    staff: data.recipients.filter((p) => !p.isGuardian).length,
  }), [data.recipients]);

  async function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const incoming = [...(e.target.files || [])];
    const next: Attachment[] = [];
    for (const file of incoming) {
      if (file.size > 1500000) { setError(`${file.name} is larger than 1.5 MB.`); continue; }
      if (!/^data:/.test(file.type ? `data:${file.type}` : "data:application/octet-stream")) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
      next.push({ name: file.name, type: file.type || "application/octet-stream", size: file.size, dataUrl });
    }
    const merged = [...attachments, ...next].slice(0, 3);
    if (merged.reduce((sum, a) => sum + a.size, 0) > 3000000) { setError("Attachments must stay under 3 MB total."); return; }
    setAttachments(merged); setError(""); e.target.value = "";
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setNotice(""); setError("");
    const response = await fetch("/api/school/communications/unified", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", title, body, channel, audience, userId: userId || undefined, mediaUrl: mediaUrl || undefined, attachments }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) setError(json.message || "The message could not be sent.");
    else { setNotice(json.message || "Message sent."); setTitle(""); setBody(""); setUserId(""); setMediaUrl(""); setAttachments([]); setTab(channel === "in_app" ? "sent" : "sent"); await load(); }
    setBusy(false);
  }

  function messageTitle(message: Message) { const meta = safeMeta(message.templateVariables); return typeof meta.title === "string" ? meta.title : message.body.split("\n")[0] || "Message"; }
  function senderName(message: Message) { const meta = safeMeta(message.templateVariables); return typeof meta.senderName === "string" ? meta.senderName : "School communication"; }
  function attachmentList(message: Message): Attachment[] { const meta = safeMeta(message.templateVariables); return Array.isArray(meta.attachments) ? meta.attachments as Attachment[] : []; }

  return <div className="mx-auto max-w-[1480px] space-y-5 pb-10">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><span className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-600">Communication centre</span><h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Send, receive and follow up without guessing.</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{schoolName} has one communication desk. Pick the audience first, then choose the channel. Portal messages stay inside SukuuNova; SMS and WhatsApp use the school’s configured providers.</p></div><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-700"><RefreshCw size={14}/> Refresh</button>
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => setTab("compose")} className={`rounded-2xl border p-3 text-left ${tab === "compose" ? "border-emerald-600 bg-emerald-50" : "border-slate-200"}`}><b className="block text-xs text-slate-950">Compose</b><span className="text-[10px] text-slate-500">Start a new conversation or broadcast.</span></button>
        <button type="button" onClick={() => setTab("inbox")} className={`rounded-2xl border p-3 text-left ${tab === "inbox" ? "border-emerald-600 bg-emerald-50" : "border-slate-200"}`}><b className="block text-xs text-slate-950">Inbox {data.unreadCount > 0 ? `· ${data.unreadCount} new` : ""}</b><span className="text-[10px] text-slate-500">Messages sent to you.</span></button>
        <button type="button" onClick={() => setTab("sent")} className={`rounded-2xl border p-3 text-left ${tab === "sent" ? "border-emerald-600 bg-emerald-50" : "border-slate-200"}`}><b className="block text-xs text-slate-950">Sent & delivery</b><span className="text-[10px] text-slate-500">Portal, SMS and WhatsApp status.</span></button>
      </div>
    </section>

    {tab === "compose" ? <section className="grid gap-5 xl:grid-cols-[1.25fr,.75fr]">
      <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6"><span className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">01 · Write</span><h2 className="mt-2 text-lg font-black text-slate-950">What do you want to say?</h2></div>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5"><span className="text-[10px] font-black uppercase tracking-[.08em] text-slate-600">Subject</span><input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} className="rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-950 outline-none focus:border-emerald-600" placeholder="PTA reminder, fee notice, appreciation…"/></label><label className="grid gap-1.5"><span className="text-[10px] font-black uppercase tracking-[.08em] text-slate-600">Channel</span><select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-950"><option value="in_app">SukuuNova inbox — recommended</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></label></div>
        <label className="mt-4 grid gap-1.5"><span className="text-[10px] font-black uppercase tracking-[.08em] text-slate-600">Message</span><textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={5000} rows={8} className="rounded-xl border border-slate-300 px-3 py-3 text-sm leading-6 text-slate-950 outline-none focus:border-emerald-600" placeholder="Write the message exactly as the recipient should receive it…"/></label>
        <div className="mt-4 grid gap-3">
          <div className="text-[10px] font-black uppercase tracking-[.08em] text-slate-600">02 · Choose audience</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{([['individual','One person',data.recipients.length],['guardians','Parents / guardians',counts.guardians],['teachers','Teachers',counts.teachers],['staff','Staff',counts.staff]] as const).map(([value,label,count]) => <button key={value} type="button" onClick={() => setAudience(value)} className={`rounded-2xl border p-3 text-left ${audience === value ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><b className="block text-xs text-slate-950">{label}</b><span className="mt-1 block text-[10px] text-slate-500">{count} active account{count === 1 ? "" : "s"}</span></button>)}</div>
          {audience === "individual" ? <select value={userId} onChange={(e) => setUserId(e.target.value)} required className="rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-950"><option value="">Select the person</option>{data.recipients.map((p) => <option key={p.id} value={p.id}>{p.name} · {roleLabel(p)}{p.phone ? ` · ${p.phone}` : ""}</option>)}</select> : null}
        </div>
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.08em] text-slate-700"><Paperclip size={14}/> Portal attachments</div><p className="mt-1 text-[10px] leading-5 text-slate-500">Attach up to three files, 3 MB total. These are securely carried with the SukuuNova inbox message. For SMS/WhatsApp, use a public media URL instead.</p><input type="file" multiple onChange={addFiles} disabled={channel !== "in_app"} className="mt-3 block w-full text-xs text-slate-600 disabled:opacity-50"/>{attachments.length ? <div className="mt-3 grid gap-2">{attachments.map((a, i) => <div key={`${a.name}-${i}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"><span className="truncate text-xs font-semibold text-slate-800">{a.name}</span><button type="button" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} aria-label={`Remove ${a.name}`} className="text-slate-400 hover:text-slate-900"><X size={15}/></button></div>)}</div> : null}</div>
        {channel !== "in_app" ? <label className="mt-4 grid gap-1.5"><span className="text-[10px] font-black uppercase tracking-[.08em] text-slate-600">Public media URL (optional)</span><input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} type="url" className="rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-950" placeholder="https://…"/><span className="text-[10px] text-slate-400">WhatsApp templates can carry an approved public media URL.</span></label> : null}
        <div className="mt-6 flex flex-wrap items-center gap-3"><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-[11px] font-black text-white disabled:opacity-50"><Send size={15}/>{busy ? "Sending…" : `Send via ${channelCopy[channel].label}`}</button>{notice && <span className="text-[10px] font-bold text-emerald-700">{notice}</span>}{error && <span className="inline-flex items-center gap-2 text-[10px] font-bold text-rose-700"><AlertTriangle size={14}/>{error}</span>}</div>
      </form>
      <aside className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-7"><span className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-300">03 · Know what happens</span><div className="mt-5 grid gap-3">{(Object.keys(channelCopy) as Array<keyof typeof channelCopy>).map((key) => { const Icon = channelCopy[key].icon; return <div key={key} className={`rounded-2xl border p-4 ${channel === key ? "border-emerald-300/50 bg-white/10" : "border-white/10 bg-white/5"}`}><div className="flex items-center gap-3"><Icon size={17}/><strong className="text-xs">{channelCopy[key].label}</strong></div><p className="mt-2 text-[10px] leading-5 text-slate-300">{channelCopy[key].detail}</p></div>; })}</div></section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Inbox signal</span><div className="mt-3 flex items-end justify-between"><strong className="text-4xl font-black text-slate-950">{data.unreadCount}</strong><span className="text-right text-[10px] leading-4 text-slate-500">unread<br/>messages</span></div><p className="mt-3 text-[10px] leading-5 text-slate-500">The inbox refreshes automatically while you are on the communication centre.</p></section>
      </aside>
    </section> : null}

    {tab === "inbox" ? <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="mb-5 flex items-end justify-between gap-4"><div><span className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-600">Your inbox</span><h2 className="mt-2 text-lg font-black text-slate-950">Messages addressed to you</h2></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[9px] font-black text-emerald-700">{data.unreadCount} unread</span></div>{data.inbox.length ? <div className="grid gap-3">{data.inbox.map((message) => { const files = attachmentList(message); return <article key={message.id} className={`rounded-2xl border p-4 ${message.status === "read" ? "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50/50"}`}><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><strong className="text-xs font-black text-slate-950">{messageTitle(message)}</strong>{message.status !== "read" && <span className="rounded-full bg-emerald-600 px-2 py-1 text-[8px] font-black text-white">NEW</span>}</div><p className="mt-1 text-[10px] text-slate-500">From {senderName(message)} · {displayDate(message.createdAt)}</p></div><span className="text-[9px] font-black uppercase text-slate-500">{message.status}</span></div><p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-700">{message.body.replace(/^.*?\n\n/, "")}</p>{files.length ? <div className="mt-4 grid gap-2">{files.map((file) => <a key={file.name} href={file.dataUrl} download={file.name} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700"><Paperclip size={13}/>{file.name}</a>)}</div> : null}</article>; })}</div> : <div className="py-16 text-center"><MessageSquare className="mx-auto text-slate-300" size={28}/><p className="mt-3 text-sm font-black text-slate-700">Your inbox is clear.</p><p className="mt-1 text-xs text-slate-400">New school messages will appear here.</p></div>}</section> : null}

    {tab === "sent" ? <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="mb-5"><span className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Sent & delivery</span><h2 className="mt-2 text-lg font-black text-slate-950">Know exactly what happened to each message</h2></div>{data.sent.length ? <div className="divide-y divide-slate-200">{data.sent.map((message) => <div key={message.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><strong className="truncate text-xs font-black text-slate-950">{messageTitle(message)}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black uppercase text-slate-600">{message.channel || "in_app"}</span></div><p className="mt-1 text-[10px] text-slate-500">{message.recipientType || "recipient"} · {displayDate(message.createdAt)}</p></div><div className="flex items-center gap-2 text-[9px] font-black uppercase"><span className={message.status === "failed" ? "text-rose-600" : message.status === "sent" || message.status === "delivered" ? "text-emerald-700" : "text-amber-700"}>{message.status === "failed" ? <AlertTriangle size={13}/> : message.status === "queued" ? <Clock3 size={13}/> : <Check size={13}/>} {message.status}</span></div></div>)}</div> : <div className="py-16 text-center"><MessageSquare className="mx-auto text-slate-300" size={28}/><p className="mt-3 text-sm font-black text-slate-700">Nothing sent yet.</p></div>}</section> : null}
  </div>;
}
