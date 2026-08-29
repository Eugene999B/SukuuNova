"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

type Mode = "messages" | "broadcasts" | "events" | "settings";
type Row = Record<string, unknown>;

const text = (v: unknown, fallback = "—") => typeof v === "string" && v.trim() ? v : fallback;
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.filter((x): x is Row => !!x && typeof x === "object") : [];
const date = (v: unknown) => { const d = new Date(String(v || "")); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" }); };
const number = (v: unknown) => typeof v === "number" ? v : Number(v || 0);

function Panel({ title, detail, children, action }: { title: string; detail?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.06)]">
    <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-sm font-extrabold text-slate-900">{title}</h2>{detail && <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">{detail}</p>}</div>{action}</div>{children}
  </section>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid gap-1.5"><span className="text-[10px] font-extrabold uppercase tracking-[.08em] text-slate-600">{label}</span>{children}{hint && <span className="text-[10px] leading-4 text-slate-400">{hint}</span>}</label>;
}

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const selectClass = inputClass + " cursor-pointer";

function AudienceCard({ selected, title, description, count, onClick }: { selected: boolean; title: string; description: string; count?: string | number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left transition ${selected ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"}`}>
    <div className="flex items-start justify-between gap-3"><div><strong className="block text-xs font-extrabold text-slate-900">{title}</strong><span className="mt-1 block text-[10px] leading-4 text-slate-500">{description}</span></div>{count !== undefined && <span className="rounded-full bg-slate-900 px-2 py-1 text-[9px] font-black text-white">{count}</span>}</div>
    <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[9px] font-black ${selected ? "bg-emerald-600 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>{selected ? "Selected" : "Use this audience"}</span>
  </button>;
}

export default function CommunicationCommandCenter({ mode, schoolName }: { mode: Mode; schoolName: string }) {
  const [data, setData] = useState<Row>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [audience, setAudience] = useState("guardians");
  const [channel, setChannel] = useState(mode === "messages" ? "in_app" : "sms");
  const [campaignMode, setCampaignMode] = useState("send_now");

  useEffect(() => { void load(); }, []);
  async function load() {
    const response = await fetch("/api/school/communications", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setData(body);
  }
  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault(); setBusy(true); setStatus("");
    const form = new FormData(event.currentTarget); const body: Row = { action };
    form.forEach((value, key) => { if (value !== "") body[key] = String(value); });
    body.audience = audience; body.channel = channel;
    if (campaignMode === "send_now") delete body.scheduleAt;
    try {
      const response = await fetch("/api/school/communications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message || "Action failed.");
      setStatus(payload.message || "Saved successfully."); event.currentTarget.reset(); await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Action failed."); }
    finally { setBusy(false); }
  }

  const messages = rows(data.messages); const recipients = rows(data.recipients); const events = rows(data.events); const settings = data.settings && typeof data.settings === "object" ? data.settings as Row : {};
  const guardianCount = recipients.filter(r => rows(r.roles).some(role => String(role).toLowerCase().includes("guardian"))).length || number(data.guardianCount);
  const teacherCount = recipients.filter(r => rows(r.roles).some(role => String(role).toLowerCase().includes("teacher"))).length || number(data.teacherCount);
  const staffCount = recipients.length;
  const external = messages.filter(m => ["sms", "whatsapp"].includes(text(m.channel)));

  if (mode === "messages") return <div className="mx-auto max-w-[1480px] space-y-5">
    <div className="grid gap-5 xl:grid-cols-[1.25fr,.75fr]">
      <Panel title="Send a school message" detail="Send one message from SukuuNova to the people who need it. Recipients are resolved from the school database; you do not need to copy phone numbers.">
        <form className="grid gap-5" onSubmit={e => submit(e, "send")}>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Subject"><input name="title" className={inputClass} placeholder="e.g. PTA meeting reminder" required /></Field><Field label="Channel" hint="Portal delivery is immediate and does not use SMS credits."><select value={channel} onChange={e => setChannel(e.target.value)} className={selectClass}><option value="in_app">Parent / staff portal</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></Field></div>
          <Field label="Message"><textarea name="body" rows={7} className={inputClass} placeholder="Write the message your school wants to send…" required /></Field>
          <div><div className="mb-2 text-[10px] font-extrabold uppercase tracking-[.08em] text-slate-600">Who should receive it?</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AudienceCard selected={audience === "guardians"} title="Parents & guardians" description="All active guardian portal accounts with a linked student." count={guardianCount || "—"} onClick={() => setAudience("guardians")} />
            <AudienceCard selected={audience === "teachers"} title="Teachers" description="Teaching staff currently attached to the school." count={teacherCount || "—"} onClick={() => setAudience("teachers")} />
            <AudienceCard selected={audience === "staff"} title="All staff" description="Everyone with an active school staff account." count={staffCount || "—"} onClick={() => setAudience("staff")} />
            <AudienceCard selected={audience === "individual"} title="One person" description="Send privately to one parent, teacher or staff account." onClick={() => setAudience("individual")} />
          </div></div>
          {audience === "individual" && <Field label="Recipient"><select name="userId" className={selectClass} required><option value="">Select a person</option>{recipients.map(r => <option key={text(r.id)} value={text(r.id)}>{text(r.name)}{text(r.phone, "")} </option>)}</select></Field>}
          <div className="flex flex-wrap items-center gap-3"><button disabled={busy} className="rounded-xl bg-slate-900 px-5 py-3 text-[11px] font-black text-white hover:bg-slate-800 disabled:opacity-50">{busy ? "Sending…" : "Send message"}</button><Link href="/school/communications/broadcasts" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-[11px] font-extrabold text-slate-700">Use bulk SMS / WhatsApp</Link>{status && <span className="text-[10px] font-semibold text-emerald-700">{status}</span>}</div>
        </form>
      </Panel>
      <Panel title="Communication overview" detail="Live activity from this school's communication workspace.">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="text-[9px] font-extrabold uppercase tracking-[.12em] text-slate-500">Recent messages</span><strong className="mt-2 block text-2xl font-black text-slate-900">{messages.length}</strong><span className="text-[10px] text-slate-500">Recorded in this school</span></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="text-[9px] font-extrabold uppercase tracking-[.12em] text-slate-500">Portal recipients</span><strong className="mt-2 block text-2xl font-black text-slate-900">{recipients.length}</strong><span className="text-[10px] text-slate-500">Active accounts available</span></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="text-[9px] font-extrabold uppercase tracking-[.12em] text-slate-500">Channels</span><strong className="mt-2 block text-lg font-black text-slate-900">Portal · SMS · WhatsApp</strong><span className="text-[10px] text-slate-500">Centralised delivery</span></div></div>
      </Panel>
    </div>
    <Panel title="Message history" detail="Every message remains tied to its recipient, channel, status and school account.">{messages.length ? <div className="divide-y divide-slate-200">{messages.slice(0, 30).map(m => <div key={text(m.id)} className="flex items-center justify-between gap-5 py-4"><div className="min-w-0"><strong className="block truncate text-xs font-extrabold text-slate-900">{text(m.body, "Message").split("\n")[0]}</strong><span className="text-[10px] text-slate-500">{text(m.channel)} · {text(m.recipientType)} · {date(m.createdAt)}</span></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase text-slate-700">{text(m.status)}</span></div>)}</div> : <div className="grid min-h-36 place-items-center text-center text-[11px] text-slate-400">No messages have been sent yet.</div>}</Panel>
  </div>;

  if (mode === "broadcasts") return <div className="mx-auto max-w-[1480px] space-y-5">
    <div className="grid gap-5 xl:grid-cols-[1.1fr,.9fr]">
      <Panel title="Bulk communications" detail={`Send one school-approved message to a complete audience without entering individual phone numbers. SukuuNova resolves the recipients for ${schoolName}.`}>
        <form className="grid gap-5" onSubmit={e => submit(e, "broadcast")}>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Campaign name"><input name="title" className={inputClass} placeholder="Term reopening reminder" required /></Field><Field label="Channel"><select value={channel} onChange={e => setChannel(e.target.value)} className={selectClass}><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></Field></div>
          <Field label="Audience"><select value={audience} onChange={e => setAudience(e.target.value)} className={selectClass}><option value="guardians">All parents / guardians</option><option value="teachers">Teachers</option><option value="staff">All staff</option><option value="all">Everyone with a valid phone</option></select></Field>
          <Field label="Message"><textarea name="body" rows={7} className={inputClass} placeholder="Write the message…" required /></Field>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Delivery"><select value={campaignMode} onChange={e => setCampaignMode(e.target.value)} className={selectClass}><option value="send_now">Send as soon as approved</option><option value="scheduled">Schedule for later</option></select></Field>{campaignMode === "scheduled" ? <Field label="Send on"><input name="scheduleAt" type="datetime-local" className={inputClass} required /></Field> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-5 text-slate-600">SukuuNova will create the delivery jobs immediately and the provider will handle the external send.</div>}</div>
          {channel === "whatsapp" && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><strong className="text-xs font-extrabold text-slate-900">WhatsApp document/media</strong><p className="mt-1 text-[10px] leading-5 text-slate-500">For automated school documents, SukuuNova should generate the attachment internally. Manual URLs are not required for report cards and other system-generated documents.</p></div>}
          <div className="flex flex-wrap items-center gap-3"><button disabled={busy} className="rounded-xl bg-slate-900 px-5 py-3 text-[11px] font-black text-white">{busy ? "Preparing…" : "Prepare bulk send"}</button><Link href="/school/communications/settings" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-[11px] font-extrabold text-slate-700">Open channel settings</Link>{status && <span className="text-[10px] font-semibold text-emerald-700">{status}</span>}</div>
        </form>
      </Panel>
      <Panel title="SMS account" detail="This panel is designed for the future school SMS credit wallet controlled by the SukuuNova platform administrator.">
        <div className="space-y-3"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="text-[9px] font-extrabold uppercase tracking-[.12em] text-slate-500">Available credits</span><strong className="mt-2 block text-3xl font-black text-slate-900">{typeof settings.smsCredits === "number" ? settings.smsCredits : "0"}</strong><span className="text-[10px] text-slate-500">Allocated by SukuuNova administration</span></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><strong className="text-xs font-extrabold text-slate-900">SMS sender</strong><p className="mt-1 text-[10px] text-slate-500">{text(settings.smsSenderId, "Not configured")}</p></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><strong className="text-xs font-extrabold text-amber-900">Usage protection</strong><p className="mt-1 text-[10px] leading-5 text-amber-800">SukuuNova will check audience size, SMS segments, available credits and delivery eligibility before a bulk send is released.</p></div></div>
      </Panel>
    </div>
    <Panel title="Automation library" detail="The goal is that recurring communication is triggered by school activity, not by an administrator remembering to send it.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[["Payment received","Send receipt/confirmation to the linked parent automatically."],["Report card approved","Generate the report attachment and deliver it to the student's linked parent."],["Student absence","Notify the student's guardian according to the school's attendance rule."],["Transport boarding","Send boarding/arrival notifications for linked students."],["Event reminder","Send reminders before a school event based on its audience and schedule."],["Emergency alert","Authorised school leaders can send a priority notice across the chosen channels."]].map(([title,detail])=><div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><strong className="text-xs font-extrabold text-slate-900">{title}</strong><span className="rounded-full bg-emerald-100 px-2 py-1 text-[8px] font-black text-emerald-700">Automation</span></div><p className="mt-2 text-[10px] leading-5 text-slate-500">{detail}</p></div>)}</div>
    </Panel>
    <Panel title="External delivery history" detail="Separate the operational history of SMS and WhatsApp from portal messages.">{external.length ? <div className="divide-y divide-slate-200">{external.slice(0, 40).map(m => <div key={text(m.id)} className="flex items-center justify-between gap-5 py-4"><div><strong className="text-xs font-extrabold text-slate-900">{text(m.channel).toUpperCase()}</strong><span className="ml-2 text-[10px] text-slate-500">{text(m.recipientType)} · {date(m.createdAt)}</span></div><span className="text-[9px] font-black uppercase text-slate-600">{text(m.status)}</span></div>)}</div> : <div className="py-10 text-center text-[11px] text-slate-400">No external delivery jobs yet.</div>}</Panel>
  </div>;

  if (mode === "events") return <div className="mx-auto max-w-[1480px] space-y-5">
    <div className="grid gap-5 xl:grid-cols-[1.15fr,.85fr]">
      <Panel title="School events" detail="Plan the school's calendar and keep the event, audience, reminders and operational impact together.">{events.length ? <div className="divide-y divide-slate-200">{events.slice(0, 40).map(ev => <div key={text(ev.id)} className="py-4"><div className="flex items-start justify-between gap-4"><div><span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black uppercase tracking-[.12em] text-slate-600">{text(ev.type, "event")}</span><h3 className="mt-2 text-sm font-extrabold text-slate-900">{text(ev.name)}</h3><p className="mt-1 text-[10px] text-slate-500">{date(ev.startDate)} → {date(ev.endDate)}{text(ev.location, "") ? ` · ${text(ev.location)}` : ""}</p></div><span className="text-[9px] font-black uppercase text-emerald-700">Planned</span></div></div>)}</div> : <div className="grid min-h-56 place-items-center text-center text-[11px] text-slate-400">No school events yet.</div>}</Panel>
      <Panel title="Create event" detail="The event can later feed attendance, transport, invitations and reminder automation."><form className="grid gap-4" onSubmit={e => submit(e, "create_event")}><Field label="Event name"><input name="name" className={inputClass} placeholder="PTA meeting / Sports Day / Open Day" required /></Field><div className="grid gap-4 md:grid-cols-2"><Field label="Event type"><select name="type" defaultValue="parent" className={selectClass}><option value="parent">Parent / community</option><option value="academic">Academic</option><option value="operational">Operational</option><option value="sports">Sports</option><option value="trip">Trip / excursion</option><option value="meeting">Meeting</option><option value="holiday">Holiday</option><option value="exam_week">Exam week</option><option value="closure">Closure</option><option value="other">Other</option></select></Field><Field label="Location"><input name="location" className={inputClass} placeholder="School hall / field" /></Field></div><div className="grid gap-4 md:grid-cols-2"><Field label="Starts"><input name="startDate" type="datetime-local" className={inputClass} required /></Field><Field label="Ends"><input name="endDate" type="datetime-local" className={inputClass} required /></Field></div><Field label="Description"><textarea name="description" rows={5} className={inputClass} placeholder="Instructions and information for families/staff…" /></Field><div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-[10px] text-slate-700"><label><input type="checkbox" name="notifyGuardians" className="mr-2" /> Notify linked parents / guardians</label><label><input type="checkbox" name="notifyStaff" className="mr-2" /> Notify staff</label></div><button disabled={busy} className="rounded-xl bg-slate-900 px-5 py-3 text-[11px] font-black text-white">{busy ? "Creating…" : "Create event"}</button>{status && <p className="text-[10px] font-semibold text-emerald-700">{status}</p>}</form></Panel>
    </div>
    <Panel title="Event workflow" detail="Every important event can become a small automation plan instead of a calendar entry only."><div className="grid gap-3 md:grid-cols-4">{[["Plan","Date, time, location and event type"],["Audience","Parents, students, staff or selected groups"],["Reminders","Schedule one or more notices before the event"],["Follow-through","Attendance, transport and post-event messages"]].map(([a,b], i)=><div key={a} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="text-[9px] font-black text-slate-400">0{i+1}</span><strong className="mt-2 block text-xs font-extrabold text-slate-900">{a}</strong><p className="mt-1 text-[10px] leading-5 text-slate-500">{b}</p></div>)}</div></Panel>
  </div>;

  return <div className="mx-auto max-w-[1480px] space-y-5">
    <Panel title="Communication settings" detail="Configure how SukuuNova communicates for this school. Provider credentials remain controlled and should never be exposed in ordinary message forms.">
      <form className="grid gap-5" onSubmit={e => submit(e, "save_settings")}>
        <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center justify-between"><div><strong className="text-sm font-extrabold text-slate-900">SMS</strong><p className="mt-1 text-[10px] text-slate-500">Sender identity, credits, consent and usage controls.</p></div><span className="rounded-full bg-slate-200 px-2 py-1 text-[8px] font-black uppercase text-slate-700">Provider</span></div><div className="mt-4 grid gap-4"><Field label="School sender ID" hint="For Ghana, use the school's registered sender identity where required."><input name="smsSenderId" defaultValue={text(settings.smsSenderId, "")} maxLength={20} className={inputClass} placeholder="Your School" /></Field><label className="flex items-center gap-3 text-[11px] font-bold text-slate-700"><input type="checkbox" name="sms_enabled" defaultChecked={rows(settings.channels).includes("sms")} /> Enable SMS as a delivery channel</label></div></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center justify-between"><div><strong className="text-sm font-extrabold text-slate-900">WhatsApp</strong><p className="mt-1 text-[10px] text-slate-500">School-specific business sender, approved templates and automated documents.</p></div><span className="rounded-full bg-slate-200 px-2 py-1 text-[8px] font-black uppercase text-slate-700">Provider</span></div><div className="mt-4 grid gap-4"><Field label="Business sender"><input name="whatsappFrom" defaultValue={text((settings.whatsapp && typeof settings.whatsapp === "object" ? settings.whatsapp as Row : {}).from, "")} className={inputClass} placeholder="Configured by platform admin" /></Field><label className="flex items-center gap-3 text-[11px] font-bold text-slate-700"><input type="checkbox" name="whatsapp_enabled" defaultChecked={rows(settings.channels).includes("whatsapp")} /> Enable WhatsApp as a delivery channel</label></div></div></div>
        <div><div className="mb-2 text-[10px] font-extrabold uppercase tracking-[.08em] text-slate-600">Automatic notifications</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[["payment_received","Payment received"],["report_card_ready","Report card ready"],["student_absence","Student absence"],["staff_late","Staff late"],["transport_boarding","Transport boarding"],["emergency_broadcast","Emergency broadcast"]].map(([key,label])=><label key={key} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-[11px] font-bold text-slate-800"><input type="checkbox" name={key} defaultChecked={Boolean((settings.automation && typeof settings.automation === "object" ? settings.automation as Row : {})[key])} /><span>{label}</span></label>)}</div></div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[10px] leading-5 text-emerald-900"><strong>Automatic report-card delivery:</strong> when enabled, SukuuNova resolves the linked guardian account automatically and can send the generated report document through the configured channel. Staff do not paste a report-card URL.</div>
        <div className="flex flex-wrap items-center gap-3"><button disabled={busy} className="rounded-xl bg-slate-900 px-5 py-3 text-[11px] font-black text-white">{busy ? "Saving…" : "Save communication settings"}</button>{status && <span className="text-[10px] font-semibold text-emerald-700">{status}</span>}</div>
      </form>
    </Panel>
    <Panel title="Communication rules" detail="Recommended controls for a professional school communications system."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[["Audience controls","Class, house, year group, guardian, staff, role and individual targeting."],["Delivery protection","Check credit balance, phone validity, channel eligibility and consent before dispatch."],["Templates","Reusable school-approved templates for fees, attendance, events, report cards and emergencies."],["Audit & analytics","Keep send time, audience, status, failures, retries and delivery evidence." ]].map(([a,b])=><div key={a} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><strong className="text-xs font-extrabold text-slate-900">{a}</strong><p className="mt-2 text-[10px] leading-5 text-slate-500">{b}</p></div>)}</div></Panel>
  </div>;
}
