"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Inbox, MailPlus, MessageCircle, RefreshCw, Search, Send, UserRound } from "lucide-react";

type Message = { id:string; title:string; body:string; senderName:string; senderId?:string|null; createdAt:string; readAt?:string|null; attachments?:Array<{name:string;dataUrl:string}> };
type Person = { id:string; name:string; email?:string|null; phone?:string|null; roles?:string[] };
type InboxPayload = { messages?:Message[]; unreadCount?:number; recipients?:Person[]; message?:string };

const roleLabel = (roles: string[] = []) => roles.slice(0, 2).map((role) => role.replaceAll("_", " ")).join(" · ") || "School staff";
const messageText = (message: Message) => message.body.replace(/^.*?\n\n/, "");

export default function GuardianMessagesDesk() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState(0);
  const [recipients, setRecipients] = useState<Person[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedMessage, setSelectedMessage] = useState("");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/guardian/messages", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as InboxPayload;
      if (!response.ok) throw new Error(payload.message || "Could not load family messages.");
      setMessages(payload.messages || []);
      setUnread(payload.unreadCount || 0);
      setRecipients(payload.recipients || []);
      setSelectedMessage((current) => current && (payload.messages || []).some((message) => message.id === current) ? current : (payload.messages?.[0]?.id || ""));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load family messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleMessages = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? messages.filter((message) => `${message.title} ${message.senderName} ${message.body}`.toLowerCase().includes(query)) : messages;
  }, [messages, search]);
  const active = messages.find((message) => message.id === selectedMessage) || null;
  const recipient = recipients.find((person) => person.id === selected) || null;

  async function read(message: Message) {
    setSelectedMessage(message.id);
    if (message.readAt) return;
    const response = await fetch("/api/guardian/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_read", messageId: message.id }),
    });
    if (response.ok) await load();
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/guardian/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", recipientId: selected, title, body }),
      });
      const payload = await response.json().catch(() => ({})) as InboxPayload;
      if (!response.ok) throw new Error(payload.message || "Message could not be sent.");
      setNotice(payload.message || "Message sent."); setTitle(""); setBody("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="gmd-page">
    <section className="gmd-hero">
      <div><span>FAMILY COMMUNICATION HUB</span><h1>One inbox. The right person. No chasing phone numbers.</h1><p>Read school updates and send a direct, auditable message to an active staff member without leaving SukuuNova.</p></div>
      <div className="gmd-stats"><div><strong>{unread}</strong><span>Unread</span></div><div><strong>{recipients.length}</strong><span>Staff available</span></div></div>
    </section>
    {error ? <div className="gmd-alert bad" role="alert">{error}</div> : null}
    {notice ? <div className="gmd-alert good" role="status"><CheckCircle2 size={16}/>{notice}</div> : null}

    <section className="gmd-shell">
      <aside className="gmd-inbox">
        <header><div><span>INBOX</span><h2>Family conversations</h2></div><button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh messages"><RefreshCw size={16}/></button></header>
        <label className="gmd-search"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages…" /></label>
        <div className="gmd-message-list">{loading && !messages.length ? <div className="gmd-empty">Loading messages…</div> : visibleMessages.length ? visibleMessages.map((message) => <button type="button" key={message.id} onClick={() => void read(message)} className={selectedMessage === message.id ? "active" : ""}>
          <span className={`gmd-avatar ${message.readAt ? "" : "unread"}`}>{message.senderName.slice(0,2).toUpperCase()}</span>
          <span className="gmd-preview"><strong>{message.senderName}</strong><b>{message.title}</b><small>{messageText(message).slice(0,76)}{messageText(message).length > 76 ? "…" : ""}</small></span>
          {!message.readAt ? <i aria-label="Unread message" /> : null}
        </button>) : <div className="gmd-empty"><MessageCircle size={26}/><strong>No messages found</strong><span>School notices and direct replies will appear here.</span></div>}</div>
      </aside>

      <main className="gmd-reader">{active ? <>
        <header><div><span>MESSAGE</span><h2>{active.title}</h2><p>From <strong>{active.senderName}</strong> · {new Date(active.createdAt).toLocaleString("en-GH")}</p></div><span className="gmd-status">{active.readAt ? "Read" : "New"}</span></header>
        <article>{messageText(active)}</article>
        {active.attachments?.length ? <div className="gmd-attachments">{active.attachments.map((attachment) => <a key={attachment.name} href={attachment.dataUrl} download={attachment.name}>{attachment.name}</a>)}</div> : null}
      </> : <div className="gmd-empty large"><Inbox size={32}/><strong>Your conversation space</strong><span>Select a message to read it here.</span></div>}</main>

      <form onSubmit={send} className="gmd-compose">
        <header><div><span>NEW MESSAGE</span><h2>Contact school staff</h2></div><MailPlus size={20}/></header>
        <p>Choose the staff member responsible for your question. The school receives this inside its secured communication trail.</p>
        <label><span>Staff member</span><select required value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a staff member</option>{recipients.map((person) => <option key={person.id} value={person.id}>{person.name} · {roleLabel(person.roles)}</option>)}</select></label>
        {recipient ? <div className="gmd-recipient"><UserRound size={17}/><div><strong>{recipient.name}</strong><span>{roleLabel(recipient.roles)}{recipient.email ? ` · ${recipient.email}` : ""}</span></div></div> : null}
        <label><span>Subject</span><input required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="e.g. Question about Akua's attendance" /></label>
        <label><span>Message</span><textarea required value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={8} placeholder="Write your message clearly…" /></label>
        <div className="gmd-compose-foot"><small>{body.length}/5000</small><button disabled={busy || !selected}><Send size={15}/>{busy ? "Sending…" : "Send message"}</button></div>
      </form>
    </section>
    <style>{css}</style>
  </div>;
}

const css = `
.gmd-page{max-width:1420px;margin:0 auto;padding-bottom:44px;display:grid;gap:16px;color:var(--sn-ink)}
.gmd-hero{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:28px 30px;border:1px solid var(--sn-line);border-radius:24px;background:linear-gradient(135deg,var(--sn-guardian-tint),var(--sn-surface) 58%,var(--sn-surface-2));box-shadow:var(--sn-shadow-sm)}
.gmd-hero>div:first-child>span,.gmd-shell header span,.gmd-compose label>span{font-size:10px;font-weight:900;letter-spacing:.12em;color:var(--sn-guardian-accent);text-transform:uppercase}.gmd-hero h1{margin:6px 0 8px;max-width:760px;font-size:clamp(25px,3.5vw,38px);line-height:1.08}.gmd-hero p{margin:0;max-width:720px;color:var(--sn-muted);font-size:13px;line-height:1.6}.gmd-stats{display:grid;grid-template-columns:repeat(2,110px);gap:8px}.gmd-stats>div{padding:17px;border:1px solid var(--sn-line);border-radius:17px;background:var(--sn-surface);text-align:center}.gmd-stats strong{display:block;font-size:25px}.gmd-stats span{color:var(--sn-muted);font-size:10px}
.gmd-alert{display:flex;align-items:center;gap:8px;padding:12px 14px;border:1px solid var(--sn-line);border-radius:12px;background:var(--sn-surface);font-size:12px}.gmd-alert.bad{color:var(--color-danger)}.gmd-alert.good{color:var(--color-success)}
.gmd-shell{min-height:620px;display:grid;grid-template-columns:minmax(250px,.72fr) minmax(320px,1.08fr) minmax(330px,.88fr);overflow:hidden;border:1px solid var(--sn-line);border-radius:24px;background:var(--sn-surface);box-shadow:var(--sn-shadow-sm)}.gmd-inbox,.gmd-reader,.gmd-compose{min-width:0;padding:20px}.gmd-inbox,.gmd-reader{border-right:1px solid var(--sn-line)}.gmd-shell header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.gmd-shell h2{font-size:17px;margin:4px 0}.gmd-shell header p{margin:4px 0;color:var(--sn-muted);font-size:11px}.gmd-shell header button{display:grid;place-items:center;width:36px;height:36px;border:1px solid var(--sn-line);border-radius:10px;background:var(--sn-surface-2);color:var(--sn-ink);cursor:pointer}
.gmd-search{margin:14px 0;display:flex;align-items:center;gap:8px;padding:0 11px;border:1px solid var(--sn-line);border-radius:12px;background:var(--sn-surface-2);color:var(--sn-muted)}.gmd-search input{width:100%;height:40px;border:0;outline:0;background:transparent;color:var(--sn-ink)}.gmd-message-list{display:grid;gap:6px;max-height:520px;overflow:auto}.gmd-message-list>button{width:100%;display:grid;grid-template-columns:40px 1fr auto;gap:10px;align-items:center;text-align:left;padding:11px;border:1px solid transparent;border-radius:14px;background:transparent;color:var(--sn-ink);cursor:pointer}.gmd-message-list>button:hover,.gmd-message-list>button.active{background:var(--sn-surface-2);border-color:var(--sn-line)}.gmd-message-list>button>i{width:7px;height:7px;border-radius:99px;background:var(--sn-guardian-accent)}.gmd-avatar{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:var(--sn-surface-2);border:1px solid var(--sn-line);font-size:10px;font-weight:900}.gmd-avatar.unread{background:var(--sn-guardian-tint);color:var(--sn-guardian-accent)}.gmd-preview{min-width:0;display:grid;gap:2px}.gmd-preview strong,.gmd-preview b,.gmd-preview small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gmd-preview strong{font-size:11px}.gmd-preview b{font-size:10.5px}.gmd-preview small{color:var(--sn-muted);font-size:9.5px;font-weight:500}
.gmd-reader header{padding-bottom:18px;border-bottom:1px solid var(--sn-line)}.gmd-status{padding:5px 9px;border:1px solid var(--sn-line);border-radius:999px;background:var(--sn-surface-2);font-size:9px!important;letter-spacing:.05em!important;color:var(--sn-muted)!important}.gmd-reader article{padding:24px 4px;white-space:pre-wrap;color:var(--sn-ink);font-size:13px;line-height:1.9}.gmd-attachments{display:grid;gap:7px}.gmd-attachments a{padding:10px;border:1px solid var(--sn-line);border-radius:10px;color:var(--sn-guardian-accent);font-size:11px;text-decoration:none}
.gmd-compose{display:flex;flex-direction:column;gap:14px}.gmd-compose>p{margin:0;color:var(--sn-muted);font-size:11.5px;line-height:1.6}.gmd-compose label{display:grid;gap:6px}.gmd-compose select,.gmd-compose input,.gmd-compose textarea{box-sizing:border-box;width:100%;border:1px solid var(--sn-line);border-radius:12px;background:var(--sn-surface-2);color:var(--sn-ink);padding:11px 12px;font:inherit;font-size:12px;outline:none}.gmd-compose select:focus,.gmd-compose input:focus,.gmd-compose textarea:focus{border-color:var(--sn-guardian-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--sn-guardian-accent) 15%,transparent)}.gmd-compose textarea{resize:vertical;line-height:1.6}.gmd-recipient{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--sn-line);border-radius:12px;background:var(--sn-guardian-tint);color:var(--sn-guardian-accent)}.gmd-recipient div{display:grid}.gmd-recipient strong{font-size:11px}.gmd-recipient span{font-size:9.5px;color:var(--sn-muted)}.gmd-compose-foot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:10px}.gmd-compose-foot small{color:var(--sn-muted);font-size:9px}.gmd-compose-foot button{display:inline-flex;align-items:center;gap:7px;padding:11px 15px;border:0;border-radius:11px;background:var(--sn-guardian-accent);color:var(--color-surface);font-size:11px;font-weight:850;cursor:pointer}.gmd-compose-foot button:disabled{opacity:.5;cursor:not-allowed}
.gmd-empty{min-height:150px;display:grid;place-items:center;align-content:center;gap:7px;text-align:center;color:var(--sn-muted);font-size:11px}.gmd-empty strong{color:var(--sn-ink);font-size:12px}.gmd-empty.large{height:100%;min-height:450px}
@media(max-width:1100px){.gmd-shell{grid-template-columns:.8fr 1.2fr}.gmd-compose{grid-column:1/-1;border-top:1px solid var(--sn-line)}.gmd-reader{border-right:0}}
@media(max-width:720px){.gmd-hero{display:block;padding:21px}.gmd-stats{margin-top:18px;grid-template-columns:1fr 1fr}.gmd-shell{display:block}.gmd-inbox,.gmd-reader{border-right:0;border-bottom:1px solid var(--sn-line)}.gmd-reader{min-height:280px}.gmd-empty.large{min-height:250px}}
`;
